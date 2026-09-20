import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { Readable } from "node:stream";
import express from "express";
import {
	parseMp4,
	tryParseMp4Chunks,
	extractFtyp,
	findMoov,
	Mp4ParseError,
	type Mp4Chunk,
	type VideoInfo,
} from "./mp4-parser";
import { demoHtml } from "./demo";
import { imageDemoHtml } from "./image-demo";
import { imageRouter } from "./images";

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Health check / liveness probe — returns a small JSON payload.
app.get("/ping", (req, res) => {
	res.json({ message: "Express.js running on Cloudflare Workers!" });
});

// In-browser demo / API playground for the MP4 parser (served as HTML).
app.get("/", (_req, res) => {
	res.type("html").send(demoHtml);
});

// Isolated front page for the image info fetcher (served as HTML).
app.get("/image", (_req, res) => {
	res.type("html").send(imageDemoHtml);
});

// Image metadata API: /api/image?url= (GET) and POST /api/image.
app.use("/api/image", imageRouter);

const MAX_BYTES = 200 * 1024 * 1024;

/** Validate a remote URL, fetch it, and stream it through the MP4 parser. */
async function fetchAndParse(url: string, signal?: AbortSignal) {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Mp4ParseError("Invalid URL.", 400);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Mp4ParseError("URL must be http(s).", 400);
	}

	let upstream: Response;
	try {
		upstream = await fetch(url, { redirect: "follow" });
	} catch {
		throw new Mp4ParseError("Failed to fetch the provided URL.", 502);
	}
	if (!upstream.ok) {
		throw new Mp4ParseError(`Upstream returned HTTP ${upstream.status}`, 502);
	}
	if (!upstream.body) {
		throw new Mp4ParseError("Upstream returned no body.", 502);
	}
	return parseMp4(upstream.body, { signal, maxBytes: MAX_BYTES });
}

const RANGE_PROBE_BYTES = 4 * 1024 * 1024; // 4MB head/tail probe

/** Parse the total length from a Content-Range header like "bytes 0-1023/5242880". */
function contentRangeTotal(v: string | null): number | null {
	if (!v) return null;
	const m = /\/(\d+)\s*$/.exec(v);
	return m ? Number.parseInt(m[1], 10) : null;
}

/**
 * URL mode with a simple Range probing strategy ("seconds for any size"):
 *  1. Range-probe the head; if the server ignores Range (HTTP 200) just stream
 *     the whole body (today's behaviour).
 *  2. If the head already contains a complete `moov` (faststart), parse & return.
 *  3. Otherwise Range-probe the tail, extract the trailing `moov`, and parse it
 *     together with the head's `ftyp`.
 *  4. Fall back to a full streaming fetch whenever probing can't locate `moov`.
 */
async function fetchAndParseSmart(url: string, signal?: AbortSignal) {
	// Head probe.
	let headResp: Response;
	try {
		headResp = await fetch(url, {
			headers: { Range: `bytes=0-${RANGE_PROBE_BYTES - 1}` },
			redirect: "follow",
			signal,
		});
	} catch {
		throw new Mp4ParseError("Failed to fetch the provided URL.", 502);
	}
	if (headResp.status === 200) {
		// Range not supported -> we already hold the full body stream.
		if (!headResp.body) {
			throw new Mp4ParseError("Upstream returned no body.", 502);
		}
		return parseMp4(headResp.body, { signal, maxBytes: MAX_BYTES });
	}
	if (headResp.status !== 206) {
		throw new Mp4ParseError(`Upstream returned HTTP ${headResp.status}`, 502);
	}

	const headBuf = await headResp.arrayBuffer();
	const head = new Uint8Array(headBuf);

	// Fast path: `moov` fully inside the head probe (faststart files).
	const headInfo = await tryParseMp4Chunks([{ data: headBuf, fileStart: 0 }]);
	if (headInfo) return headInfo;

	// Need the total length to probe the tail.
	const total = contentRangeTotal(headResp.headers.get("content-range"));
	if (total === null) return fetchAndParse(url, signal);

	// Tail probe: locate a trailing `moov`.
	const tailStart = Math.max(0, total - RANGE_PROBE_BYTES);
	let tailResp: Response;
	try {
		tailResp = await fetch(url, {
			headers: { Range: `bytes=${tailStart}-${total - 1}` },
			redirect: "follow",
			signal,
		});
	} catch {
		return fetchAndParse(url, signal);
	}
	if (tailResp.status !== 206) return fetchAndParse(url, signal);
	const tail = new Uint8Array(await tailResp.arrayBuffer());

	const moov = findMoov(tail);
	if (!moov) return fetchAndParse(url, signal);
	const moovBuf = tail.slice(moov.start, moov.start + moov.size)
		.buffer as ArrayBuffer;

	// Feed `ftyp` (for brands/mime) followed by `moov`, laid out contiguously.
	const ftyp = extractFtyp(head);
	const chunks: Mp4Chunk[] = [];
	let fileStart = 0;
	if (ftyp) {
		const ftypBuf = ftyp.buffer.slice(
			ftyp.byteOffset,
			ftyp.byteOffset + ftyp.byteLength,
		) as ArrayBuffer;
		chunks.push({ data: ftypBuf, fileStart: 0 });
		fileStart = ftypBuf.byteLength;
	}
	chunks.push({ data: moovBuf, fileStart });

	const info = await tryParseMp4Chunks(chunks);
	if (info) return info;

	// Last resort: stream the whole file.
	return fetchAndParse(url, signal);
}

const CACHE_TTL_SECONDS = 10 * 60; // 10 minutes

/**
 * URL-mode parse with a 10-minute KV cache keyed by the source URL, so repeated
 * requests for the same file skip the remote fetch entirely. Errors are never
 * cached; if the KV binding is absent this degrades to a plain (uncached) parse.
 */
async function parseUrlCached(
	url: string,
	signal?: AbortSignal,
): Promise<{ info: VideoInfo; cache: "HIT" | "MISS" }> {
	const cache = (env as { mp4_cache?: KVNamespace }).mp4_cache;
	const key = `mp4:url:` + url;

	if (cache) {
		try {
			const hit = await cache.get(key, { type: "json" });
			if (hit) return { info: hit as VideoInfo, cache: "HIT" };
		} catch {
			/* ignore cache read failures */
		}
	}

	const info = await fetchAndParseSmart(url, signal);

	if (cache) {
		try {
			await cache.put(key, JSON.stringify(info), {
				expirationTtl: CACHE_TTL_SECONDS,
			});
		} catch {
			/* ignore cache write failures */
		}
	}

	return { info, cache: "MISS" };
}

// GET /api/parse?url=https://example.com/video.mp4
//
//   URL-mode parse, no request body — convenient for quick browser/curl checks.
//
//   Input : query param `url` (http/https only).
//   Flow  : URL-keyed KV cache (10 min TTL) → on a miss, fetchAndParseSmart()
//           probes the remote file with Range requests and streams mp4box.js.
//   Output: 200 { success:true, source:"url", cache:"HIT"|"MISS", info:{...} }.
//   Errors: 400 missing/invalid url; 502 upstream fetch/HTTP failure;
//           422 not a parseable MP4; 413 exceeds size cap; 500 unexpected.
app.get("/api/parse", async (req, res) => {
	try {
		// Pull the single `url` query param (Express may parse repeated params as array).
		const url = typeof req.query.url === "string" ? req.query.url : "";
		if (!url) {
			return res.status(400).json({
				success: false,
				error: 'Provide a "url" query parameter, e.g. GET /api/parse?url=https://example.com/video.mp4',
			});
		}
		// Forward the client's abort signal so we cancel the upstream fetch if the
		// client disconnects mid-parse.
		const signal = (req as unknown as { signal?: AbortSignal }).signal;
		const { info, cache } = await parseUrlCached(url, signal);
		return res.json({ success: true, source: "url", cache, info });
	} catch (e) {
		// Mp4ParseError carries the right HTTP status; anything else is a 500.
		if (e instanceof Mp4ParseError) {
			return res.status(e.status).json({ success: false, error: e.message });
		}
		console.error(e);
		return res.status(500).json({ success: false, error: "Internal error while parsing the video." });
	}
});

// POST /api/parse
//
//   Two input modes, selected by Content-Type:
//
//   (A) URL mode  — Content-Type: application/json
//       Body: { "url": "https://example.com/video.mp4" }
//       Same KV-cached, Range-probing flow as the GET route above.
//
//   (B) File mode — Content-Type: video/mp4 | application/octet-stream
//       Body: the raw MP4 bytes (NOT multipart). Streamed straight into
//       mp4box.js. Not cached — there is no stable key without buffering the
//       whole body first, and the savings here would be CPU, not network reads.
//
//   Output: 200 { success:true, source:"url"|"body", [cache], info:{...} }.
//   Errors: 400 empty/missing url or bad JSON; 413 size cap; 422 unparseable;
//           502 upstream failure; 500 unexpected.
app.post("/api/parse", async (req, res) => {
	try {
		const signal = (req as unknown as { signal?: AbortSignal }).signal;
		const contentType = String(req.headers["content-type"] ?? "");

		// ---- (A) URL mode: JSON body with a `url` field ------------------------
		if (contentType.includes("application/json")) {
			const body = req.body as { url?: unknown } | undefined;
			const url = typeof body?.url === "string" ? body.url : "";
			if (!url) {
				return res.status(400).json({
					success: false,
					error: 'Provide a JSON body with a "url" field, or POST raw MP4 bytes as the request body.',
				});
			}
			// Reuses the cached, Range-probing parser from the GET route.
			const { info, cache } = await parseUrlCached(url, signal);
			return res.json({ success: true, source: "url", cache, info });
		}

		// ---- (B) File mode: raw MP4 bytes on the request body -------------------
		// express.json() only parses application/json, so for any other Content-Type
		// the body stays an unparsed stream. Convert the Node IncomingMessage stream
		// into a Web ReadableStream and feed it to mp4box.js incrementally.
		const source = Readable.toWeb(req as unknown as Readable) as unknown as ReadableStream<Uint8Array>;
		const info = await parseMp4(source, { signal, maxBytes: MAX_BYTES });
		return res.json({ success: true, source: "body", info });
	} catch (e) {
		if (e instanceof Mp4ParseError) {
			return res.status(e.status).json({ success: false, error: e.message });
		}
		console.error(e);
		return res.status(500).json({ success: false, error: "Internal error while parsing the video." });
	}
});

app.listen(3000);
export default httpServerHandler({ port: 3000 });