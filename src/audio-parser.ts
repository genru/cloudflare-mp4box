import type { VideoInfo } from "./mp4-parser";

export interface AudioTags {
	title?: string;
	artist?: string;
	album?: string;
	albumArtist?: string;
	year?: string;
	genre?: string;
	track?: string;
	comment?: string;
}

export interface AudioInfo {
	format: "mp3" | "wav" | "flac" | "ogg" | "m4a";
	mime: string;
	codec?: string;
	duration?: number; // seconds
	bitrate?: number; // bps
	sampleRate?: number;
	channelCount?: number;
	bitDepth?: number;
	byteSize?: number;
	tags?: AudioTags;
}

export interface AudioParseOptions {
	maxBytes?: number;
	signal?: AbortSignal;
}

export class AudioParseError extends Error {
	constructor(
		message: string,
		public status: number = 400,
	) {
		super(message);
		this.name = "AudioParseError";
	}
}

function readUInt16LE(buf: Uint8Array, o: number): number {
	return buf[o] | (buf[o + 1] << 8);
}
function readUInt32LE(buf: Uint8Array, o: number): number {
	return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
}
function readUInt32BE(buf: Uint8Array, o: number): number {
	return (buf[o] * 0x1000000 + (buf[o + 1] << 16) + (buf[o + 2] << 8) + buf[o + 3]) >>> 0;
}
function readUInt24BE(buf: Uint8Array, o: number): number {
	return (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2];
}
function str(buf: Uint8Array, start: number, len: number): string {
	let s = "";
	for (let i = 0; i < len && start + i < buf.length; i++) {
		s += String.fromCharCode(buf[start + i]);
	}
	return s;
}

export function detectAudioFormat(buf: Uint8Array): AudioInfo["format"] | null {
	if (buf.length < 12) return null;
	if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return "mp3"; // "ID3"
	if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3"; // frame sync
	if (
		buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
		buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
	)
		return "wav"; // "RIFF....WAVE"
	if (buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) return "flac"; // "fLaC"
	if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return "ogg"; // "OggS"
	if (str(buf, 4, 4) === "ftyp") return "m4a"; // ISO-BMFF container (M4A/M4B/MP4 audio)
	return null;
}

function mimeFor(f: AudioInfo["format"]): string {
	switch (f) {
		case "mp3":
			return "audio/mpeg";
		case "wav":
			return "audio/wav";
		case "flac":
			return "audio/flac";
		case "ogg":
			return "audio/ogg";
		case "m4a":
			return "audio/mp4";
	}
}

/* ------------------------------------------------------------------------ *
 * Text decoding helpers (ID3 / comments)
 * ------------------------------------------------------------------------ */

function decodeLatin1(buf: Uint8Array, start: number, len: number): string {
	let s = "";
	for (let i = 0; i < len && start + i < buf.length; i++) {
		const c = buf[start + i];
		if (c === 0) break;
		s += String.fromCharCode(c);
	}
	return s;
}

function decodeUtf8(buf: Uint8Array, start: number, len: number): string {
	try {
		return new TextDecoder("utf-8").decode(buf.subarray(start, start + len)).replace(/\0+$/, "");
	} catch {
		return decodeLatin1(buf, start, len);
	}
}

/** Decode an ID3v2 text payload (first byte = encoding marker). */
function decodeId3Text(buf: Uint8Array, start: number, len: number): string {
	if (len <= 0) return "";
	const enc = buf[start];
	const body = buf.subarray(start + 1, start + len);
	try {
		switch (enc) {
			case 0:
				return decodeLatin1(buf, start + 1, len - 1).trim();
			case 3:
				return new TextDecoder("utf-8").decode(body).replace(/\0+$/, "").trim();
			case 1: {
				// UTF-16 with BOM
				const le = body.length >= 2 && body[0] === 0xff && body[1] === 0xfe;
				const be = body.length >= 2 && body[0] === 0xfe && body[1] === 0xff;
				const dec = new TextDecoder(le ? "utf-16le" : be ? "utf-16be" : "utf-16le");
				return dec.decode(body.subarray(le || be ? 2 : 0)).replace(/\0+$/, "").trim();
			}
			case 2:
				return new TextDecoder("utf-16be").decode(body).replace(/\0+$/, "").trim();
			default:
				return decodeUtf8(buf, start, len).trim();
		}
	} catch {
		return "";
	}
}

/* ------------------------------------------------------------------------ *
 * Vorbis comment (shared by FLAC + OGG Vorbis + Opus tags)
 * ------------------------------------------------------------------------ */

const VORBIS_KEY_MAP: Record<string, keyof AudioTags> = {
	TITLE: "title",
	ARTIST: "artist",
	ALBUM: "album",
	ALBUMARTIST: "albumArtist",
	"ALBUM ARTIST": "albumArtist",
	DATE: "year",
	YEAR: "year",
	GENRE: "genre",
	TRACKNUMBER: "track",
	COMMENT: "comment",
	DESCRIPTION: "comment",
};

function parseVorbisComment(buf: Uint8Array, tags: AudioTags): void {
	if (buf.length < 8) return;
	let p = 0;
	const vendorLen = readUInt32LE(buf, p);
	p += 4 + vendorLen;
	if (p + 4 > buf.length) return;
	const count = readUInt32LE(buf, p);
	p += 4;
	for (let i = 0; i < count && p + 4 <= buf.length; i++) {
		const len = readUInt32LE(buf, p);
		p += 4;
		if (p + len > buf.length) break;
		const entry = decodeUtf8(buf, p, len);
		p += len;
		const eq = entry.indexOf("=");
		if (eq <= 0) continue;
		const key = entry.slice(0, eq).toUpperCase();
		const value = entry.slice(eq + 1).trim();
		if (!value) continue;
		const field = VORBIS_KEY_MAP[key];
		if (field && !tags[field]) tags[field] = value;
	}
}

/* ------------------------------------------------------------------------ *
 * MP3 — ID3v2 tags + first MPEG frame header (+ ID3v1 tail fallback)
 * ------------------------------------------------------------------------ */

// kbps tables indexed by [bitrateIndex]; version 1 vs 2/2.5, layer I/II/III
const MP3_BITRATE_V1: Record<number, number[]> = {
	1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
	2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
	3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
};
const MP3_BITRATE_V2: Record<number, number[]> = {
	1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
	2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
	3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_SAMPLE_RATES: Record<number, number[]> = {
	3: [44100, 48000, 32000], // MPEG 1
	2: [22050, 24000, 16000], // MPEG 2
	0: [11025, 12000, 8000], // MPEG 2.5
};

const ID3V1_GENRES = [
	"Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge",
	"Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B",
	"Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska",
	"Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient",
	"Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical",
	"Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise",
	"Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative",
	"Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave",
	"Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream",
	"Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap",
	"Pop/Funk", "Jungle", "Native US", "Cabaret", "New Wave", "Psychedelic",
	"Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk",
	"Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock",
];

const ID3_TEXT_FRAMES: Record<string, keyof AudioTags> = {
	TIT2: "title",
	TPE1: "artist",
	TALB: "album",
	TPE2: "albumArtist",
	TDRC: "year",
	TYER: "year",
	TCON: "genre",
	TRCK: "track",
};

function syncsafe(buf: Uint8Array, o: number): number {
	return ((buf[o] & 0x7f) << 21) | ((buf[o + 1] & 0x7f) << 14) | ((buf[o + 2] & 0x7f) << 7) | (buf[o + 3] & 0x7f);
}

function parseId3v2(buf: Uint8Array, tags: AudioTags): number {
	// Header: "ID3" verMajor verMinor flags size(4 syncsafe)
	const major = buf[3];
	const flags = buf[5];
	const size = syncsafe(buf, 6);
	let p = 10;
	const end = Math.min(10 + size, buf.length);
	// v2.4 footer flag (0x10) only affects the returned offset, not frame parsing.
	if (major === 3 && flags & 0x40 && p + 4 <= end) {
		// extended header (v2.3): u32 size then that many bytes
		const extSize = readUInt32BE(buf, p);
		p += 4 + extSize;
	} else if (major === 4 && flags & 0x40 && p + 4 <= end) {
		const extSize = syncsafe(buf, p);
		p += extSize;
	}

	while (p + 10 <= end) {
		const id = str(buf, p, 4);
		if (!/^[A-Z0-9]{4}$/.test(id)) break;
		const frameSize = major === 4 ? syncsafe(buf, p + 4) : readUInt32BE(buf, p + 4);
		if (frameSize <= 0 || p + 10 + frameSize > end) break;
		const dataStart = p + 10;
		const field = ID3_TEXT_FRAMES[id];
		if (field && !tags[field]) {
			const v = decodeId3Text(buf, dataStart, frameSize);
			if (v) tags[field] = v;
		} else if (id === "COMM" && !tags.comment) {
			// encoding(1) + language(3) + short desc (null-terminated) + text
			const enc = buf[dataStart];
			let q = dataStart + 4;
			const limit = dataStart + frameSize;
			if (enc === 1 || enc === 2) {
				// 2-byte null terminator
				while (q + 1 < limit && !(buf[q] === 0 && buf[q + 1] === 0)) q += 2;
				q += 2;
			} else {
				while (q < limit && buf[q] !== 0) q++;
				q += 1;
			}
			if (q < limit) {
				const body = buf.subarray(q, limit);
				let text = "";
				try {
					if (enc === 0) text = decodeLatin1(body, 0, body.length);
					else if (enc === 3) text = decodeUtf8(body, 0, body.length);
					else if (enc === 2) text = new TextDecoder("utf-16be").decode(body);
					else text = new TextDecoder("utf-16le").decode(body);
				} catch { /* keep empty */ }
				text = text.replace(/\0+$/, "").trim();
				if (text) tags.comment = text;
			}
		}
		p = dataStart + frameSize;
	}

	return 10 + size + (major === 4 && flags & 0x10 ? 10 : 0);
}

function parseId3v1(buf: Uint8Array, tags: AudioTags): void {
	if (buf.length < 128) return;
	const base = buf.length - 128;
	if (str(buf, base, 3) !== "TAG") return;
	const clean = (s: string) => s.replace(/\0+$/, "").trim();
	if (!tags.title) {
		const v = clean(decodeLatin1(buf, base + 3, 30));
		if (v) tags.title = v;
	}
	if (!tags.artist) {
		const v = clean(decodeLatin1(buf, base + 33, 30));
		if (v) tags.artist = v;
	}
	if (!tags.album) {
		const v = clean(decodeLatin1(buf, base + 63, 30));
		if (v) tags.album = v;
	}
	if (!tags.year) {
		const v = clean(decodeLatin1(buf, base + 93, 4));
		if (v) tags.year = v;
	}
	if (!tags.genre) {
		const g = buf[base + 127];
		if (g < ID3V1_GENRES.length) tags.genre = ID3V1_GENRES[g];
	}
}

function parseMp3(buf: Uint8Array, info: AudioInfo, byteSize?: number): void {
	const tags: AudioTags = {};
	let offset = 0;
	if (str(buf, 0, 3) === "ID3" && buf.length >= 10) {
		offset = Math.min(parseId3v2(buf, tags), buf.length);
	}

	// Scan for the first MPEG audio frame header.
	const scanLimit = Math.min(offset + 65536, buf.length - 4);
	for (let i = offset; i < scanLimit; i++) {
		if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
		const b1 = buf[i + 1];
		const b2 = buf[i + 2];
		const b3 = buf[i + 3];
		const versionBits = (b1 >> 3) & 3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
		const layerBits = (b1 >> 1) & 3; // 3=I, 2=II, 1=III
		const bitrateIdx = (b2 >> 4) & 15;
		const srIdx = (b2 >> 2) & 3;
		if (versionBits === 1 || layerBits === 0 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) continue;

		const layer = 4 - layerBits; // 1, 2 or 3
		const versionName = versionBits === 3 ? "1" : versionBits === 2 ? "2" : "2.5";
		const table = versionBits === 3 ? MP3_BITRATE_V1 : MP3_BITRATE_V2;
		const kbps = table[layer]?.[bitrateIdx];
		const sr = MP3_SAMPLE_RATES[versionBits]?.[srIdx];
		if (!kbps || !sr) continue;

		info.codec = layer === 3 ? "mp3" : `mp${layer}`;
		if (layer !== 3) info.codec = `MPEG-${versionName} Layer ${layer}`;
		info.bitrate = kbps * 1000;
		info.sampleRate = sr;
		info.channelCount = ((b3 >> 6) & 3) === 3 ? 1 : 2;

		// CBR duration estimate from total size (off for VBR, close otherwise).
		const total = byteSize ?? buf.length;
		if (total > i && info.bitrate) {
			info.duration = Number((((total - i) * 8) / info.bitrate).toFixed(3));
		}
		break;
	}

	// ID3v1 sits in the last 128 bytes — only visible when we hold the tail.
	parseId3v1(buf, tags);
	if (Object.keys(tags).length) info.tags = tags;
}

/* ------------------------------------------------------------------------ *
 * WAV — RIFF fmt/data chunks + LIST INFO tags
 * ------------------------------------------------------------------------ */

const WAV_INFO_TAGS: Record<string, keyof AudioTags> = {
	INAM: "title",
	IART: "artist",
	IPRD: "album",
	IGNR: "genre",
	ICRD: "year",
	ITRK: "track",
	ICMT: "comment",
};

function wavCodecName(code: number): string {
	switch (code) {
		case 1:
			return "pcm";
		case 3:
			return "pcm-float";
		case 6:
			return "alaw";
		case 7:
			return "mulaw";
		case 85:
			return "mp3";
		case 255:
			return "aac";
		default:
			return `unknown(${code})`;
	}
}

function parseWav(buf: Uint8Array, info: AudioInfo): void {
	let p = 12;
	let byteRate: number | null = null;
	let dataSize: number | null = null;
	const tags: AudioTags = {};

	while (p + 8 <= buf.length) {
		const id = str(buf, p, 4);
		const size = readUInt32LE(buf, p + 4);
		const dataStart = p + 8;
		const dataEnd = Math.min(dataStart + size, buf.length);

		if (id === "fmt " && size >= 16) {
			const audioFormat = readUInt16LE(buf, dataStart);
			info.codec = wavCodecName(audioFormat);
			info.channelCount = readUInt16LE(buf, dataStart + 2);
			info.sampleRate = readUInt32LE(buf, dataStart + 4);
			byteRate = readUInt32LE(buf, dataStart + 8);
			info.bitrate = byteRate * 8;
			info.bitDepth = readUInt16LE(buf, dataStart + 14);
		} else if (id === "data") {
			dataSize = size; // declared size, even if data extends past our buffer
		} else if (id === "LIST" && str(buf, dataStart, 4) === "INFO") {
			let q = dataStart + 4;
			while (q + 8 <= dataEnd) {
				const subId = str(buf, q, 4);
				const subSize = readUInt32LE(buf, q + 4);
				const field = WAV_INFO_TAGS[subId];
				if (field && !tags[field]) {
					const v = decodeUtf8(buf, q + 8, Math.min(subSize, dataEnd - q - 8)).trim();
					if (v) tags[field] = v;
				}
				q += 8 + subSize + (subSize & 1);
			}
		}

		p = dataStart + size + (size & 1);
		if (id === "data") {
			// data is usually the last chunk; the payload itself may be beyond our head buffer
			if (p > buf.length) break;
		}
	}

	if (byteRate && dataSize != null) {
		info.duration = Number((dataSize / byteRate).toFixed(3));
	}
	if (Object.keys(tags).length) info.tags = tags;
}

/* ------------------------------------------------------------------------ *
 * FLAC — STREAMINFO + VORBIS_COMMENT metadata blocks
 * ------------------------------------------------------------------------ */

function parseFlac(buf: Uint8Array, info: AudioInfo): void {
	const tags: AudioTags = {};
	let p = 4;
	while (p + 4 <= buf.length) {
		const header = buf[p];
		const isLast = (header & 0x80) !== 0;
		const type = header & 0x7f;
		const len = readUInt24BE(buf, p + 1);
		const dataStart = p + 4;
		const dataEnd = dataStart + len;
		if (dataEnd > buf.length) break;

		if (type === 0 && len >= 34) {
			// STREAMINFO: 64-bit BE field at offset 10 packs sr/ch/bps/totalSamples
			const hi = readUInt32BE(buf, dataStart + 10);
			const lo = readUInt32BE(buf, dataStart + 14);
			const combined = hi * 0x100000000 + lo;
			const sampleRate = Math.floor(combined / 0x100000000000); // >> 44
			const channels = (Math.floor(combined / 0x20000000000) & 7) + 1; // >> 41
			const bps = (Math.floor(combined / 0x1000000000) & 31) + 1; // >> 36
			const totalSamples = combined % 0x1000000000; // & (2^36 - 1)
			info.codec = "flac";
			info.sampleRate = sampleRate;
			info.channelCount = channels;
			info.bitDepth = bps;
			if (sampleRate && totalSamples) {
				info.duration = Number((totalSamples / sampleRate).toFixed(3));
			}
		} else if (type === 4) {
			parseVorbisComment(buf.subarray(dataStart, dataEnd), tags);
		}

		if (isLast) break;
		p = dataEnd;
	}
	if (Object.keys(tags).length) info.tags = tags;
}

/* ------------------------------------------------------------------------ *
 * OGG — Vorbis / Opus identification + comment packets
 * ------------------------------------------------------------------------ */

interface OggPacket {
	data: Uint8Array;
}

/** Assemble the first packets from OGG pages found in `buf` (head of file). */
function collectOggPackets(buf: Uint8Array, maxPackets = 2): OggPacket[] {
	const packets: OggPacket[] = [];
	let current: Uint8Array[] = [];
	let p = 0;

	while (p + 27 <= buf.length && packets.length < maxPackets) {
		if (str(buf, p, 4) !== "OggS") {
			// resync to the next capture pattern
			const next = buf.indexOf(0x4f, p + 1); // 'O'
			if (next === -1) break;
			p = next;
			continue;
		}
		const pageSegments = buf[p + 26];
		const segTableStart = p + 27;
		if (segTableStart + pageSegments > buf.length) break;
		let body = segTableStart + pageSegments;

		for (let s = 0; s < pageSegments; s++) {
			const lacing = buf[segTableStart + s];
			if (body + lacing > buf.length) return packets; // truncated page
			current.push(buf.subarray(body, body + lacing));
			body += lacing;
			if (lacing < 255) {
				// packet complete
				const total = current.reduce((n, c) => n + c.length, 0);
				const pkt = new Uint8Array(total);
				let off = 0;
				for (const c of current) {
					pkt.set(c, off);
					off += c.length;
				}
				packets.push({ data: pkt });
				current = [];
				if (packets.length >= maxPackets) break;
			}
		}
		p = body;
	}
	return packets;
}

function parseOgg(buf: Uint8Array, info: AudioInfo, byteSize?: number): void {
	const packets = collectOggPackets(buf, 2);
	const id = packets[0]?.data;
	if (!id || id.length < 8) return;

	const tags: AudioTags = {};

	if (id[0] === 0x01 && str(id, 1, 6) === "vorbis") {
		// Vorbis identification header
		info.codec = "vorbis";
		if (id.length >= 30) {
			info.channelCount = id[11];
			info.sampleRate = readUInt32LE(id, 12);
			const nominal = readUInt32LE(id, 20);
			if (nominal) info.bitrate = nominal;
		}
		const comment = packets[1]?.data;
		if (comment && comment[0] === 0x03 && str(comment, 1, 6) === "vorbis") {
			parseVorbisComment(comment.subarray(7), tags);
		}
	} else if (str(id, 0, 8) === "OpusHead") {
		info.codec = "opus";
		info.channelCount = id[9];
		const inputRate = readUInt32LE(id, 12);
		info.sampleRate = inputRate || 48000;
		const comment = packets[1]?.data;
		if (comment && str(comment, 0, 8) === "OpusTags") {
			parseVorbisComment(comment.subarray(8), tags);
		}
	} else if (str(id, 0, 9) === "fishead\0\0") {
		info.codec = "ogg-skeleton";
	}

	// Duration: granule position of the LAST OGG page / sampleRate. When the
	// buffer covers the file tail (body mode) we can read it directly; the
	// router performs a tail Range probe for URL mode.
	const total = byteSize ?? buf.length;
	if (info.sampleRate && buf.length === total) {
		const d = oggDurationFromTail(buf, info.sampleRate);
		if (d != null) info.duration = d;
	}

	if (Object.keys(tags).length) info.tags = tags;
}

/**
 * Find the last OGG page in a tail buffer and convert its granule position to
 * seconds. `sampleRate` comes from the identification header (48kHz for Opus).
 */
export function oggDurationFromTail(tail: Uint8Array, sampleRate: number): number | null {
	if (!sampleRate) return null;
	for (let i = tail.length - 27; i >= 0; i--) {
		if (
			tail[i] === 0x4f && tail[i + 1] === 0x67 && tail[i + 2] === 0x67 && tail[i + 3] === 0x53
		) {
			const lo = readUInt32LE(tail, i + 6);
			const hi = readUInt32LE(tail, i + 10);
			const granule = hi * 0x100000000 + lo;
			if (granule > 0 && granule < Number.MAX_SAFE_INTEGER) {
				return Number((granule / sampleRate).toFixed(3));
			}
			return null;
		}
	}
	return null;
}

/* ------------------------------------------------------------------------ *
 * M4A / MP4-family — reuse the mp4box-based VideoInfo and pick the audio track
 * ------------------------------------------------------------------------ */

/** Convert an mp4box-normalized VideoInfo into AudioInfo (audio track view). */
export function audioInfoFromMp4(video: VideoInfo, byteSize?: number): AudioInfo | null {
	const track = video.tracks.find((t) => t.type === "audio") ?? video.tracks[0];
	if (!track) return null;
	const info: AudioInfo = {
		format: "m4a",
		mime: "audio/mp4",
		codec: track.codec || undefined,
		sampleRate: track.sampleRate,
		channelCount: track.channelCount,
		bitrate: track.bitrate ?? video.overallBitrate,
	};
	if (video.duration) info.duration = video.duration;
	if (byteSize != null) info.byteSize = byteSize;
	return info;
}

/** True when the buffer looks like an ISO-BMFF container (ftyp box). */
export function isMp4Container(buf: Uint8Array): boolean {
	return buf.length >= 12 && str(buf, 4, 4) === "ftyp";
}

/* ------------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------------ */

/**
 * Parse audio metadata from a buffer. MP3/WAV/FLAC/OGG are parsed natively and
 * only need the head of the file (plus `byteSize` for MP3 duration estimates).
 * ISO-BMFF containers (M4A) must go through the mp4box path — this throws a
 * 422 for them; callers should detect with `isMp4Container` first.
 */
export function parseAudioBytes(
	buf: Uint8Array,
	opts: { byteSize?: number } = {},
): AudioInfo {
	if (!buf || buf.length < 12) {
		throw new AudioParseError("Input too small or empty — not a recognized audio file.", 422);
	}
	const format = detectAudioFormat(buf);
	if (!format) {
		throw new AudioParseError("Unsupported or unrecognized audio format.", 422);
	}
	if (format === "m4a") {
		throw new AudioParseError("M4A/MP4 containers are parsed via the MP4 pipeline.", 422);
	}

	const info: AudioInfo = { format, mime: mimeFor(format) };
	if (opts.byteSize != null) info.byteSize = opts.byteSize;

	switch (format) {
		case "mp3":
			parseMp3(buf, info, opts.byteSize);
			break;
		case "wav":
			parseWav(buf, info);
			break;
		case "flac":
			parseFlac(buf, info);
			break;
		case "ogg":
			parseOgg(buf, info, opts.byteSize);
			break;
	}

	return info;
}

/**
 * Stream an audio byte source and parse it once fully buffered. Used for
 * body-mode POSTs; enforces the size cap while accumulating.
 */
export async function parseAudio(
	source: AsyncIterable<Uint8Array>,
	opts: AudioParseOptions = {},
): Promise<Uint8Array> {
	const maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;
	let total = 0;
	const chunks: Uint8Array[] = [];

	for await (const chunk of source) {
		if (opts.signal?.aborted) {
			throw new AudioParseError("Request aborted", 499);
		}
		total += chunk.byteLength;
		if (total > maxBytes) {
			throw new AudioParseError(
				`Input exceeded maximum size of ${maxBytes} bytes`,
				413,
			);
		}
		chunks.push(chunk);
	}

	const buf = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		buf.set(c, off);
		off += c.byteLength;
	}
	return buf;
}
