import { Router, type Response } from "express";
import { env } from "cloudflare:workers";
import { Readable } from "node:stream";
import {
	parseImageBytes,
	parseImage,
	ImageParseError,
	type ImageInfo,
} from "./image-parser";

export const imageRouter = Router();

const MAX_HEAD_BYTES = 512 * 1024; // metadata + EXIF always sit at the file start
const MAX_FULL_BYTES = 25 * 1024 * 1024; // hard safety cap for unknown-size responses
const CACHE_TTL_SECONDS = 10 * 60; // 10 minutes

function contentRangeTotal(v: string | null): number | null {
	if (!v) return null;
	const m = /\/(\d+)\s*$/.exec(v);
	return m ? Number.parseInt(m[1], 10) : null;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}

/**
 * Fetch only the head of a remote image via Range. Image metadata always lives at
 * offset 0, so on servers that ignore Range (HTTP 200) we stream just the first
 * MAX_HEAD_BYTES and stop — never the whole file. The declared total size is taken
 * from Content-Length / Content-Range so byteSize stays accurate.
 */
async function fetchImageHead(
	url: string,
	signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; byteSize?: number }> {
	let resp: Response;
	try {
		resp = await fetch(url, {
			headers: { Range: `bytes=0-${MAX_HEAD_BYTES - 1}` },
			redirect: "follow",
			signal,
		});
	} catch {
		throw new ImageParseError("Failed to fetch the provided URL.", 502);
	}

	if (resp.status === 200) {
		if (!resp.body) throw new ImageParseError("Upstream returned no body.", 502);
		const clHeader = resp.headers.get("content-length");
		const cl = clHeader ? Number.parseInt(clHeader, 10) : null;
		const reader = resp.body.getReader();
		const chunks: Uint8Array[] = [];
		let n = 0;
		// Small files (Content-Length <= head window) are read in full; larger
		// ones are cut off at the head window because all metadata is at the start.
		const readWhole = cl != null && cl <= MAX_HEAD_BYTES;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			chunks.push(value);
			n += value.length;
			if (cl == null && n >= MAX_FULL_BYTES) {
				await reader.cancel();
				throw new ImageParseError(`Image exceeds maximum size of ${MAX_FULL_BYTES} bytes`, 413);
			}
			if (!readWhole && n >= MAX_HEAD_BYTES) {
				await reader.cancel();
				break;
			}
		}
		return { bytes: concatChunks(chunks, n), byteSize: cl ?? n };
	}

	if (resp.status !== 206) {
		throw new ImageParseError(`Upstream returned HTTP ${resp.status}`, 502);
	}

	const ab = await resp.arrayBuffer();
	const total = contentRangeTotal(resp.headers.get("content-range"));
	return { bytes: new Uint8Array(ab), byteSize: total ?? ab.byteLength };
}

/** URL-mode parse with a 10-minute KV cache keyed by the source URL. */
async function parseImageUrlCached(
	url: string,
	signal?: AbortSignal,
): Promise<{ info: ImageInfo; cache: "HIT" | "MISS" }> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new ImageParseError("Invalid URL.", 400);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new ImageParseError("URL must be http(s).", 400);
	}

	const cache = (env as { mp4_cache?: KVNamespace }).mp4_cache;
	const key = `image:url:` + url;

	if (cache) {
		try {
			const hit = await cache.get(key, { type: "json" });
			if (hit) return { info: hit as ImageInfo, cache: "HIT" };
		} catch {
			/* ignore cache read failures */
		}
	}

	const { bytes, byteSize } = await fetchImageHead(url, signal);
	const info = parseImageBytes(bytes, { byteSize });

	if (cache) {
		try {
			await cache.put(key, JSON.stringify(info), { expirationTtl: CACHE_TTL_SECONDS });
		} catch {
			/* ignore cache write failures */
		}
	}

	return { info, cache: "MISS" };
}

function handleError(e: unknown, res: Response) {
	if (e instanceof ImageParseError) {
		return res.status(e.status).json({ success: false, error: e.message });
	}
	console.error(e);
	return res.status(500).json({ success: false, error: "Internal error while parsing the image." });
}

// GET /api/image?url=https://example.com/image.png
imageRouter.get("/", async (req, res) => {
	try {
		const url = typeof req.query.url === "string" ? req.query.url : "";
		if (!url) {
			return res.status(400).json({
				success: false,
				error: 'Provide a "url" query parameter, e.g. GET /api/image?url=https://example.com/image.png',
			});
		}
		const signal = (req as unknown as { signal?: AbortSignal }).signal;
		const { info, cache } = await parseImageUrlCached(url, signal);
		return res.json({ success: true, source: "url", cache, info });
	} catch (e) {
		return handleError(e, res);
	}
});

// POST /api/image  — JSON { url } or raw image bytes
imageRouter.post("/", async (req, res) => {
	try {
		const signal = (req as unknown as { signal?: AbortSignal }).signal;
		const contentType = String(req.headers["content-type"] ?? "");

		if (contentType.includes("application/json")) {
			const body = req.body as { url?: unknown } | undefined;
			const url = typeof body?.url === "string" ? body.url : "";
			if (!url) {
				return res.status(400).json({
					success: false,
					error: 'Provide a JSON body with a "url" field, or POST raw image bytes as the request body.',
				});
			}
			const { info, cache } = await parseImageUrlCached(url, signal);
			return res.json({ success: true, source: "url", cache, info });
		}

		const source = Readable.toWeb(req as unknown as Readable) as unknown as ReadableStream<Uint8Array>;
		const info = await parseImage(source, { signal, maxBytes: MAX_FULL_BYTES });
		return res.json({ success: true, source: "body", info });
	} catch (e) {
		return handleError(e, res);
	}
});
