import { createFile, type ISOFile, type Movie, type MP4BoxBuffer } from "mp4box";

export interface TrackInfo {
	id: number;
	type: "video" | "audio" | "subtitles" | "metadata" | "hint" | "other" | string;
	codec: string;
	width?: number;
	height?: number;
	bitrate?: number;
	timescale?: number;
	nb_samples?: number;
	sampleRate?: number;
	channelCount?: number;
	language?: string;
	name?: string;
}

export interface VideoInfo {
	duration: number; // seconds
	brands: string[];
	mime: string;
	isQuickTime: boolean;
	overallBitrate?: number;
	timescale: number;
	fragmented: boolean;
	progressive: boolean;
	tracks: TrackInfo[];
}

export interface ParseOptions {
	/** Hard cap on total bytes streamed before aborting (guards against streams with no moov). */
	maxBytes?: number;
	/** AbortSignal to cancel streaming. */
	signal?: AbortSignal;
}

/** Error carrying an appropriate HTTP status for the route layer. */
export class Mp4ParseError extends Error {
	constructor(
		message: string,
		public status: number = 400,
	) {
		super(message);
		this.name = "Mp4ParseError";
	}
}

function normalize(info: Movie): VideoInfo {
	const duration = info.timescale ? info.duration / info.timescale : info.duration;
	const brands: string[] = info.brands ?? [];

	const tracks: TrackInfo[] = (info.tracks ?? []).map((t) => {
		const type: TrackInfo["type"] =
			t.type ?? (t.video ? "video" : t.audio ? "audio" : "other");
		const ti: TrackInfo = {
			id: t.id,
			type,
			codec: t.codec ?? "",
			timescale: t.timescale,
			nb_samples: t.nb_samples,
			language: t.language,
			name: t.name,
		};
		if (t.bitrate) ti.bitrate = t.bitrate;
		if (t.video) {
			ti.width = t.video.width;
			ti.height = t.video.height;
		} else if (t.track_width && t.track_height) {
			ti.width = t.track_width;
			ti.height = t.track_height;
		}
		if (t.audio) {
			ti.sampleRate = t.audio.sample_rate;
			ti.channelCount = t.audio.channel_count;
		}
		return ti;
	});

	const overallBitrate = tracks.reduce((sum, t) => sum + (t.bitrate ?? 0), 0) || undefined;

	return {
		duration: Number(duration.toFixed(6)),
		brands,
		mime: info.mime ?? "",
		isQuickTime: brands.includes("qt "),
		overallBitrate,
		timescale: info.timescale,
		fragmented: info.isFragmented,
		progressive: info.isProgressive,
		tracks,
	};
}

/**
 * Stream an MP4 byte source into mp4box.js and resolve as soon as the `moov`
 * atom is parsed (onReady). The stream is consumed incrementally so we never
 * hold the whole file in memory, and we stop feeding immediately once ready —
 * this works for both faststart and non-faststart files.
 */
export async function parseMp4(
	source: AsyncIterable<Uint8Array>,
	opts: ParseOptions = {},
): Promise<VideoInfo> {
	const maxBytes = opts.maxBytes ?? 100 * 1024 * 1024;
	const file: ISOFile = createFile();

	let totalBytes = 0;
	let offset = 0;
	let settled = false;
	let readyFired = false;

	const result = new Promise<VideoInfo>((resolve, reject) => {
		file.onError = (module: string, message: string) => {
			if (settled) return;
			settled = true;
			reject(new Mp4ParseError(`mp4box error (${module}): ${message}`, 422));
		};
		file.onReady = (info: Movie) => {
			if (settled) return;
			readyFired = true;
			settled = true;
			try {
				resolve(normalize(info));
			} catch (e) {
				reject(e);
			}
		};

		(async () => {
			try {
				for await (const chunk of source) {
					if (settled) return;
					if (opts.signal?.aborted) {
						settled = true;
						reject(new Mp4ParseError("Request aborted", 499));
						return;
					}
					totalBytes += chunk.byteLength;
					if (totalBytes > maxBytes) {
						settled = true;
						reject(
							new Mp4ParseError(
								`Input exceeded maximum size of ${maxBytes} bytes`,
								413,
							),
						);
						return;
					}
					const ab = chunk.buffer.slice(
						chunk.byteOffset,
						chunk.byteOffset + chunk.byteLength,
					) as MP4BoxBuffer;
					ab.fileStart = offset;
					offset += chunk.byteLength;
					file.appendBuffer(ab);
					if (settled || readyFired) return;
				}

				if (settled) return;
				try {
					file.flush();
				} catch {
					/* ignore flush errors */
				}
				if (!readyFired) {
					settled = true;
					reject(
						new Mp4ParseError(
							"Could not find the moov atom. The file may be truncated, not a valid MP4, or uses an unsupported structure.",
							422,
						),
					);
				}
			} catch (e) {
				if (settled) return;
				settled = true;
				reject(
					e instanceof Mp4ParseError
						? e
						: new Mp4ParseError(String((e as Error)?.message ?? e), 422),
				);
				}
				})();
				});

				return result;
				}

				/* ------------------------------------------------------------------------ *
				* Range / chunked probing helpers
				* ------------------------------------------------------------------------ */

				/** A discrete chunk of MP4 bytes at a known absolute position in the file. */
				export interface Mp4Chunk {
				data: ArrayBuffer;
				fileStart: number;
				}

				/**
				* Best-effort parse of discrete byte chunks (e.g. an `ftyp` box plus a `moov`
				* box fetched separately via HTTP Range). Resolves with normalized info on
				* success, or `null` when no `moov` can be parsed — callers use this as a
				* probe and fall back to full streaming when it returns null.
				*/
				export async function tryParseMp4Chunks(
				chunks: Mp4Chunk[],
				maxBytes = 64 * 1024 * 1024,
				): Promise<VideoInfo | null> {
				const file: ISOFile = createFile();
				let total = 0;
				let settled = false;
				let readyFired = false;

				return new Promise<VideoInfo | null>((resolve) => {
				file.onError = () => {
				if (settled) return;
				settled = true;
				resolve(null);
				};
				file.onReady = (info: Movie) => {
				if (settled) return;
				readyFired = true;
				settled = true;
				try {
					resolve(normalize(info));
				} catch {
					resolve(null);
				}
				};

				try {
				for (const chunk of chunks) {
					if (settled) return;
					total += chunk.data.byteLength;
					if (total > maxBytes) {
						settled = true;
						resolve(null);
						return;
					}
					const ab = chunk.data as MP4BoxBuffer;
					ab.fileStart = chunk.fileStart;
					file.appendBuffer(ab);
					if (settled || readyFired) return;
				}
				try {
					file.flush();
				} catch {
					/* ignore flush errors */
				}
				if (!readyFired && !settled) {
					settled = true;
					resolve(null);
				}
				} catch {
				if (settled) return;
				settled = true;
				resolve(null);
				}
				});
				}

				/**
				* Extract the leading `ftyp`/`styp` box from the head of an MP4 file, so it can
				* be fed to mp4box alongside a separately-fetched `moov` (brands/mime come from
				* `ftyp`). Returns null if the head does not start with a recognisable box.
				*/
				export function extractFtyp(head: Uint8Array): Uint8Array | null {
				if (head.length < 8) return null;
				const type = String.fromCharCode(head[4], head[5], head[6], head[7]);
				if (type !== "ftyp" && type !== "styp") return null;
				const size = new DataView(
				head.buffer,
				head.byteOffset,
				head.byteLength,
				).getUint32(0, false);
				if (size >= 8 && size <= head.length) return head.slice(0, size);
				return null;
				}

				/**
				* Locate the last well-formed top-level `moov` box inside a tail buffer (used
				* when `moov` sits at the end of a non-faststart file). Returns the byte range
				* within `tail`, or null if no complete `moov` box is present.
				*/
				export function findMoov(
				tail: Uint8Array,
				): { start: number; size: number } | null {
				let found: { start: number; size: number } | null = null;
				for (let i = 4; i + 4 <= tail.length; i++) {
				// 'moov' = 0x6d 0x6f 0x6f 0x76
				if (
				tail[i] === 0x6d &&
				tail[i + 1] === 0x6f &&
				tail[i + 2] === 0x6f &&
				tail[i + 3] === 0x76
				) {
				const start = i - 4;
				const size = new DataView(
					tail.buffer,
					tail.byteOffset + start,
					4,
				).getUint32(0, false);
				if (size >= 8 && start + size <= tail.length) {
					found = { start, size };
				}
				}
				}
				return found;
				}
