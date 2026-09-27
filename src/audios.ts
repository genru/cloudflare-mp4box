import { Router, type Response } from "express";
import { env } from "cloudflare:workers";
import { Readable } from "node:stream";
import {
	detectAudioFormat,
	parseAudioBytes,
	parseAudio,
	audioInfoFromMp4,
	isMp4Container,
	oggDurationFromTail,
	AudioParseError,
	type AudioInfo,
} from "./audio-parser";
import {
	extractFtyp,
	findMoov,
	tryParseMp4Chunks,
	type Mp4Chunk,
} from "./mp4-parser";

export const audioRouter = Router();

const MAX_HEAD_BYTES = 512 * 1024; // audio headers/tags always sit at the file start
const MAX_TAIL_BYTES = 256 * 1024; // OGG last-page granule / fallback M4A moov probe
const MAX_FULL_BYTES = 25 * 1024 * 1024; // hard safety cap for whole-file fallbacks
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
 * Fetch only the head of a remote audio file via Range. Audio metadata always
 * lives at offset 0 (ID3v2, RIFF fmt, fLaC, OggS, ftyp), so on servers that
 * ignore Range (HTTP 200) we stream just the first MAX_HEAD_BYTES and stop.
 */
async function fetchAudioHead(
	url: string,
	signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; byteSize?: number; ranged: boolean }> {
	let resp: globalThis.Response;
	try {
		resp = await fetch(url, {
			headers: { Range: `bytes=0-${MAX_HEAD_BYTES - 1}` },
			redirect: "follow",
			signal,
		});
	} catch {
		throw new AudioParseError("Failed to fetch the provided URL.", 502);
	}

	if (resp.status === 200) {
		if (!resp.body) throw new AudioParseError("Upstream returned no body.", 502);
		const clHeader = resp.headers.get("content-length");
		const cl = clHeader ? Number.parseInt(clHeader, 10) : null;
		const reader = resp.body.getReader();
		const chunks: Uint8Array[] = [];
		let n = 0;
		const readWhole = cl != null && cl <= MAX_HEAD_BYTES;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			chunks.push(value);
			n += value.length;
			if (cl == null && n >= MAX_FULL_BYTES) {
				await reader.cancel();
				throw new AudioParseError(`Audio exceeds maximum size of ${MAX_FULL_BYTES} bytes`, 413);
			}
			if (!readWhole && n >= MAX_HEAD_BYTES) {
				await reader.cancel();
				break;
			}
		}
		return { bytes: concatChunks(chunks, n), byteSize: cl ?? n, ranged: false };
	}

	if (resp.status !== 206) {
		throw new AudioParseError(`Upstream returned HTTP ${resp.status}`, 502);
	}

	const ab = await resp.arrayBuffer();
	const total = contentRangeTotal(resp.headers.get("content-range"));
	return { bytes: new Uint8Array(ab), byteSize: total ?? ab.byteLength, ranged: true };
}

/** Fetch the trailing bytes of a remote file (for OGG duration / M4A moov). */
async function fetchAudioTail(
	url: string,
	total: number,
	signal?: AbortSignal,
): Promise<Uint8Array | null> {
	const tailStart = Math.max(0, total - MAX_TAIL_BYTES);
	let resp: globalThis.Response;
	try {
		resp = await fetch(url, {
			headers: { Range: `bytes=${tailStart}-${total - 1}` },
			redirect: "follow",
			signal,
		});
	} catch {
		return null;
	}
	if (resp.status !== 206) return null;
	return new Uint8Array(await resp.arrayBuffer());
}

/** Parse an M4A/MP4-family buffer: head first, then a head+tail moov probe. */
async function parseM4aUrl(
	url: string,
	head: Uint8Array,
	byteSize: number | undefined,
	ranged: boolean,
	signal?: AbortSignal,
): Promise<AudioInfo> {
	// Faststart: moov inside the head window.
	const headChunk: Mp4Chunk = {
		data: head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength) as ArrayBuffer,
		fileStart: 0,
	};
	let info = await tryParseMp4Chunks([headChunk]);
	if (info) {
		const audio = audioInfoFromMp4(info, byteSize);
		if (audio) return audio;
	}

	// moov at the tail — needs Range support and a known total length.
	if (ranged && byteSize != null) {
		const tail = await fetchAudioTail(url, byteSize, signal);
		if (tail) {
			const moov = findMoov(tail);
			if (moov) {
				const chunks: Mp4Chunk[] = [];
				const ftyp = extractFtyp(head);
				let fileStart = 0;
				if (ftyp) {
					const ftypBuf = ftyp.buffer.slice(
						ftyp.byteOffset,
						ftyp.byteOffset + ftyp.byteLength,
					) as ArrayBuffer;
					chunks.push({ data: ftypBuf, fileStart: 0 });
					fileStart = ftypBuf.byteLength;
				}
				chunks.push({
					data: tail.slice(moov.start, moov.start + moov.size).buffer as ArrayBuffer,
					fileStart,
				});
				info = await tryParseMp4Chunks(chunks);
				if (info) {
					const audio = audioInfoFromMp4(info, byteSize);
					if (audio) return audio;
				}
			}
		}
	}

	throw new AudioParseError(
		"Could not locate the moov atom in this M4A/MP4 file (head/tail probes failed).",
		422,
	);
}

/** URL-mode parse with a 10-minute KV cache keyed by the source URL. */
async function parseAudioUrlCached(
	url: string,
	signal?: AbortSignal,
): Promise<{ info: AudioInfo; cache: "HIT" | "MISS" }> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new AudioParseError("Invalid URL.", 400);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new AudioParseError("URL must be http(s).", 400);
	}

	const cache = (env as { mp4_cache?: KVNamespace }).mp4_cache;
	const key = `audio:url:` + url;

	if (cache) {
		try {
			const hit = await cache.get(key, { type: "json" });
			if (hit) return { info: hit as AudioInfo, cache: "HIT" };
		} catch {
			/* ignore cache read failures */
		}
	}

	const { bytes: head, byteSize, ranged } = await fetchAudioHead(url, signal);
	const format = detectAudioFormat(head);
	if (!format) {
		throw new AudioParseError("Unsupported or unrecognized audio format.", 422);
	}

	let info: AudioInfo;
	if (format === "m4a") {
		info = await parseM4aUrl(url, head, byteSize, ranged, signal);
	} else {
		info = parseAudioBytes(head, { byteSize });
		// OGG duration needs the last page's granule position — tail probe it.
		if (format === "ogg" && info.sampleRate && info.duration == null && ranged && byteSize != null) {
			const tail = await fetchAudioTail(url, byteSize, signal);
			if (tail) {
				const d = oggDurationFromTail(tail, info.sampleRate);
				if (d != null) info.duration = d;
			}
		}
	}

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
	if (e instanceof AudioParseError) {
		return res.status(e.status).json({ success: false, error: e.message });
	}
	console.error(e);
	return res.status(500).json({ success: false, error: "Internal error while parsing the audio." });
}

// GET /api/audio?url=https://example.com/song.mp3
audioRouter.get("/", async (req, res) => {
	try {
		const url = typeof req.query.url === "string" ? req.query.url : "";
		if (!url) {
			return res.status(400).json({
				success: false,
				error: 'Provide a "url" query parameter, e.g. GET /api/audio?url=https://example.com/song.mp3',
			});
		}
		const signal = (req as unknown as { signal?: AbortSignal }).signal;
		const { info, cache } = await parseAudioUrlCached(url, signal);
		return res.json({ success: true, source: "url", cache, info });
	} catch (e) {
		return handleError(e, res);
	}
});

// POST /api/audio  — JSON { url } or raw audio bytes
audioRouter.post("/", async (req, res) => {
	try {
		const signal = (req as unknown as { signal?: AbortSignal }).signal;
		const contentType = String(req.headers["content-type"] ?? "");

		if (contentType.includes("application/json")) {
			const body = req.body as { url?: unknown } | undefined;
			const url = typeof body?.url === "string" ? body.url : "";
			if (!url) {
				return res.status(400).json({
					success: false,
					error: 'Provide a JSON body with a "url" field, or POST raw audio bytes as the request body.',
				});
			}
			const { info, cache } = await parseAudioUrlCached(url, signal);
			return res.json({ success: true, source: "url", cache, info });
		}

		// Raw audio bytes: buffer (capped), then parse. MP3/WAV/FLAC/OGG parse
		// natively; M4A goes through mp4box on the buffered bytes.
		const source = Readable.toWeb(req as unknown as Readable) as unknown as ReadableStream<Uint8Array>;
		const buf = await parseAudio(source, { signal, maxBytes: MAX_FULL_BYTES });

		if (isMp4Container(buf)) {
			const chunk: Mp4Chunk = {
				data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
				fileStart: 0,
			};
			const video = await tryParseMp4Chunks([chunk]);
			const audio = video ? audioInfoFromMp4(video, buf.length) : null;
			if (!audio) {
				throw new AudioParseError("Could not parse this M4A/MP4 file.", 422);
			}
			return res.json({ success: true, source: "body", info: audio });
		}

		const info = parseAudioBytes(buf, { byteSize: buf.length });
		return res.json({ success: true, source: "body", info });
	} catch (e) {
		return handleError(e, res);
	}
});
