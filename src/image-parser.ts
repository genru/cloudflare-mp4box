import { imageSize } from "image-size";

export interface ImageExif {
	make?: string;
	model?: string;
	datetime?: string;
	dpiX?: number;
	dpiY?: number;
	orientation?: number; // 1-8
	gps?: { latitude: number; longitude: number };
}

export interface ImageInfo {
	format: "png" | "jpeg" | "gif" | "webp";
	mime: string;
	width: number;
	height: number;
	bitDepth?: number;
	colorType?: string;
	hasAlpha?: boolean;
	animated?: boolean;
	frameCount?: number;
	byteSize?: number;
	exif?: ImageExif;
}

export interface ImageParseOptions {
	maxBytes?: number;
	signal?: AbortSignal;
}

export class ImageParseError extends Error {
	constructor(
		message: string,
		public status: number = 400,
	) {
		super(message);
		this.name = "ImageParseError";
	}
}

function readUInt16BE(buf: Uint8Array, o: number): number {
	return (buf[o] << 8) | buf[o + 1];
}
function readUInt32BE(buf: Uint8Array, o: number): number {
	return (buf[o] * 0x1000000 + (buf[o + 1] << 16) + (buf[o + 2] << 8) + buf[o + 3]) >>> 0;
}
function readUInt16LE(buf: Uint8Array, o: number): number {
	return buf[o] | (buf[o + 1] << 8);
}
function readUInt32LE(buf: Uint8Array, o: number): number {
	return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
}
function readUInt24LE(buf: Uint8Array, o: number): number {
	return buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
}
function str(buf: Uint8Array, start: number, len: number): string {
	let s = "";
	for (let i = 0; i < len; i++) s += String.fromCharCode(buf[start + i]);
	return s;
}

function detectFormat(buf: Uint8Array): ImageInfo["format"] | null {
	if (buf.length < 12) return null;
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
	if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
	if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
	if (
		buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x52 && buf[3] === 0x46 &&
		buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
	)
		return "webp";
	return null;
}

function mimeFor(f: ImageInfo["format"]): string {
	switch (f) {
		case "png":
			return "image/png";
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
	}
}

function pngColorType(ct: number): string {
	switch (ct) {
		case 0:
			return "grayscale";
		case 2:
			return "rgb";
		case 3:
			return "palette";
		case 4:
			return "grayscale-alpha";
		case 6:
			return "rgba";
		default:
			return "unknown";
	}
}

/** Parse a raw TIFF/EXIF block (JPEG APP1, PNG eXIf, WebP EXIF). */
export function parseTiffExif(buf: Uint8Array): ImageExif | null {
	if (!buf || buf.length < 8) return null;
	const le = buf[0] === 0x49 && buf[1] === 0x49;
	const be = buf[0] === 0x4d && buf[1] === 0x4d;
	if (!le && !be) return null;
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const u16 = (o: number) => (le ? dv.getUint16(o, true) : dv.getUint16(o, false));
	const u32 = (o: number) => (le ? dv.getUint32(o, true) : dv.getUint32(o, false));
	if (u16(2) !== 0x002a) return null;
	const ifd0 = u32(4);
	if (ifd0 + 2 > buf.length) return null;

	const exif: ImageExif = {};
	let xres: number | null = null;
	let yres: number | null = null;
	let resUnit: number | null = null;

	const typeSize = (t: number): number => {
		switch (t) {
			case 1: case 2: case 7: return 1;
			case 3: return 2;
			case 4: case 9: return 4;
			case 5: case 10: return 8;
			default: return 0;
		}
	};

	const readRational = (o: number): number | null => {
		if (o + 8 > buf.length) return null;
		const num = le ? dv.getUint32(o, true) : dv.getUint32(o, false);
		const den = le ? dv.getUint32(o + 4, true) : dv.getUint32(o + 4, false);
		if (!den) return null;
		return num / den;
	};

	const readValue = (
		entry: number,
		t: number,
		count: number,
	): { str?: string; num?: number; off?: number } | null => {
		const byteLen = typeSize(t) * count;
		let o = entry + 8;
		if (byteLen > 4) o = u32(entry + 8);
		if (o < 0 || o + byteLen > buf.length) return null;
		if (t === 2) {
			let s = "";
			for (let k = 0; k < count; k++) {
				const c = buf[o + k];
				if (c === 0) break;
				s += String.fromCharCode(c);
			}
			return { str: s };
		}
		if (t === 1) return { num: buf[o] };
		if (t === 3) return { num: u16(o) };
		if (t === 4 || t === 9) return { num: u32(o) };
		return { off: o };
	};

	const parseGps = (base: number) => {
		if (base + 2 > buf.length) return;
		const count = u16(base);
		let latRef = "N";
		let lonRef = "E";
		let lat: [number, number, number] | null = null;
		let lon: [number, number, number] | null = null;
		for (let i = 0; i < count; i++) {
			const entry = base + 2 + i * 12;
			if (entry + 12 > buf.length) break;
			const tag = u16(entry);
			const type = u16(entry + 2);
			const countv = u32(entry + 4);
			const val = readValue(entry, type, countv);
			if (!val) continue;
			if (tag === 0x0001 && val.str) latRef = val.str.trim()[0] || "N";
			else if (tag === 0x0003 && val.str) lonRef = val.str.trim()[0] || "E";
			else if (tag === 0x0002 && val.off != null) {
				const d = readRational(val.off);
				const m = readRational(val.off + 8);
				const s = readRational(val.off + 16);
				if (d != null && m != null && s != null) lat = [d, m, s];
			} else if (tag === 0x0004 && val.off != null) {
				const d = readRational(val.off);
				const m = readRational(val.off + 8);
				const s = readRational(val.off + 16);
				if (d != null && m != null && s != null) lon = [d, m, s];
			}
		}
		if (lat && lon) {
			const toDeg = (a: [number, number, number]) => a[0] + a[1] / 60 + a[2] / 3600;
			let la = toDeg(lat);
			if (latRef === "S" || latRef === "s") la = -la;
			let lo = toDeg(lon);
			if (lonRef === "W" || lonRef === "w") lo = -lo;
			exif.gps = {
				latitude: Math.round(la * 1e6) / 1e6,
				longitude: Math.round(lo * 1e6) / 1e6,
			};
		}
	};

	const parseIfd = (base: number) => {
		if (base + 2 > buf.length) return;
		const count = u16(base);
		for (let i = 0; i < count; i++) {
			const entry = base + 2 + i * 12;
			if (entry + 12 > buf.length) break;
			const tag = u16(entry);
			const type = u16(entry + 2);
			const countv = u32(entry + 4);
			const val = readValue(entry, type, countv);
			if (!val) continue;
			switch (tag) {
				case 0x0112:
					if (val.num) exif.orientation = val.num;
					break;
				case 0x010f:
					if (val.str) exif.make = val.str.trim();
					break;
				case 0x0110:
					if (val.str) exif.model = val.str.trim();
					break;
				case 0x0132:
					if (val.str && !exif.datetime) exif.datetime = val.str.trim();
					break;
				case 0x9003:
					if (val.str) exif.datetime = val.str.trim();
					break;
				case 0x011a:
					if (val.off != null) { const r = readRational(val.off); if (r != null) xres = r; }
					break;
				case 0x011b:
					if (val.off != null) { const r = readRational(val.off); if (r != null) yres = r; }
					break;
				case 0x0128:
					if (val.num != null) resUnit = val.num;
					break;
				case 0x8769: parseIfd(u32(entry + 8)); break; // Exif sub-IFD
				case 0x8825: parseGps(u32(entry + 8)); break; // GPS sub-IFD
			}
		}
	};

	parseIfd(ifd0);

	if (xres != null && yres != null && resUnit != null) {
		const f = resUnit === 2 ? 1 : resUnit === 3 ? 2.54 : null;
		if (f) {
			exif.dpiX = Math.round(xres * f);
			exif.dpiY = Math.round(yres * f);
		}
	}

	return Object.keys(exif).length ? exif : null;
}

function applyPng(buf: Uint8Array, info: ImageInfo): void {
	if (buf.length < 26) return;
	if (str(buf, 12, 4) === "IHDR") {
		info.bitDepth = buf[24];
		const ct = buf[25];
		info.colorType = pngColorType(ct);
		info.hasAlpha = ct === 4 || ct === 6;
	}
	// Walk chunks for tRNS (alpha for 0/2/3) and eXIf (EXIF).
	let p = 8;
	while (p + 8 <= buf.length) {
		const len = readUInt32BE(buf, p);
		const type = str(buf, p + 4, 4);
		const dataStart = p + 8;
		const dataEnd = dataStart + len;
		if (dataEnd > buf.length) break;
		if (type === "tRNS") {
			if (info.hasAlpha == null) info.hasAlpha = true;
		} else if (type === "eXIf") {
			const exif = parseTiffExif(buf.subarray(dataStart, dataEnd));
			if (exif) info.exif = { ...(info.exif || {}), ...exif };
		} else if (type === "IEND") {
			break;
		}
		p = dataEnd + 4; // skip CRC
	}
}

function applyGif(buf: Uint8Array, info: ImageInfo): void {
	if (buf.length < 13) return;
	const packed = buf[10];
	const gctFlag = (packed & 0x80) !== 0;
	const gctSize = gctFlag ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
	let p = 13 + gctSize;
	let frames = 0;

	const skipSubBlocks = (start: number): number => {
		let q = start;
		while (q < buf.length) {
			const len = buf[q];
			if (len === 0) return q + 1;
			q += 1 + len;
		}
		return q;
	};

	while (p < buf.length) {
		const b = buf[p];
		if (b === 0x3b) break; // trailer
		if (b === 0x21) {
			// extension; detect NETSCAPE loop for completeness
			p = skipSubBlocks(p + 2);
			continue;
		}
		if (b === 0x2c) {
			frames++;
			p += 9; // image descriptor (Left, Top, Width, Height, Packed)
			if (p >= buf.length) break;
			const ipacked = buf[p - 1];
			if (ipacked & 0x80) {
				const lctSize = 3 * (1 << ((ipacked & 0x07) + 1));
				p += lctSize;
			}
			p = skipSubBlocks(p + 1); // min-code-size byte + sub-blocks
			continue;
		}
		break; // unknown block, halt
	}
	info.frameCount = frames;
	info.animated = frames > 1;
}

function applyWebp(buf: Uint8Array, info: ImageInfo): void {
	let p = 12;
	while (p + 8 <= buf.length) {
		const id = str(buf, p, 4);
		const size = readUInt32LE(buf, p + 4);
		const payloadStart = p + 8;
		const payloadEnd = payloadStart + size;
		if (id === "VP8X") {
			const flags = readUInt32LE(buf, payloadStart);
			info.hasAlpha = (flags & 0x02) !== 0;
			info.animated = (flags & 0x10) !== 0;
		} else if (id === "ANMF") {
			info.frameCount = (info.frameCount ?? 0) + 1;
		} else if (id === "ANIM") {
			info.animated = true;
		} else if (id === "EXIF") {
			const exif = parseTiffExif(buf.subarray(payloadStart, Math.min(payloadEnd, buf.length)));
			if (exif) info.exif = { ...(info.exif || {}), ...exif };
		}
		p = payloadEnd + (size & 1); // chunks are even-padded
	}
}

function applyJpeg(buf: Uint8Array, info: ImageInfo): void {
	let p = 2;
	while (p + 3 < buf.length) {
		if (buf[p] !== 0xff) { p++; continue; }
		const marker = buf[p + 1];
		if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
		if (marker === 0x00 || marker === 0xff) { p++; continue; }
		if (p + 4 > buf.length) break;
		const len = (buf[p + 2] << 8) | buf[p + 3];
		const segStart = p + 4;
		const segEnd = p + 2 + len;
		if (segEnd > buf.length) break;

		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			info.bitDepth = buf[segStart];
			info.height = (buf[segStart + 1] << 8) | buf[segStart + 2];
			info.width = (buf[segStart + 3] << 8) | buf[segStart + 4];
		} else if (marker === 0xe1) {
			if (str(buf, segStart, 6) === "Exif\0\0") {
				const exif = parseTiffExif(buf.subarray(segStart + 6, segEnd));
				if (exif) info.exif = { ...(info.exif || {}), ...exif };
			}
		} else if (marker === 0xe0) {
			if (str(buf, segStart, 5) === "JFIF\0") {
				const unit = buf[segStart + 7];
				const xd = (buf[segStart + 8] << 8) | buf[segStart + 9];
				const yd = (buf[segStart + 10] << 8) | buf[segStart + 11];
				if (unit === 1 || unit === 2) {
					info.exif = info.exif || {};
					if (unit === 1) {
						info.exif.dpiX = xd;
						info.exif.dpiY = yd;
					} else {
						info.exif.dpiX = Math.round(xd * 2.54);
						info.exif.dpiY = Math.round(yd * 2.54);
					}
				}
			}
		}
		p = segEnd;
	}
}

/**
 * Parse a complete image (already buffered) into an ImageInfo. Dimensions and
 * format come from `image-size`; format-specific extras (bit depth, color type,
 * alpha, animation, frame count, EXIF) are extracted with custom readers.
 */
export function parseImageBytes(
	buf: Uint8Array,
	opts: { byteSize?: number } = {},
): ImageInfo {
	if (!buf || buf.length < 12) {
		throw new ImageParseError("Input too small or empty — not a recognized image.", 422);
	}
	const format = detectFormat(buf);
	if (!format) {
		throw new ImageParseError("Unsupported or unrecognized image format.", 422);
	}

	let dim: { width: number; height: number; type?: string } | null = null;
	try {
		dim = imageSize(buf);
	} catch {
		dim = null;
	}
	if (!dim || !dim.width || !dim.height) {
		throw new ImageParseError("Could not determine image dimensions.", 422);
	}

	const info: ImageInfo = {
		format,
		mime: mimeFor(format),
		width: dim.width,
		height: dim.height,
	};
	if (opts.byteSize != null) info.byteSize = opts.byteSize;

	switch (format) {
		case "png":
			applyPng(buf, info);
			break;
		case "gif":
			applyGif(buf, info);
			break;
		case "webp":
			applyWebp(buf, info);
			break;
		case "jpeg":
			applyJpeg(buf, info);
			break;
	}

	return info;
}

/**
 * Stream an image byte source and parse it once fully buffered. For images the
 * metadata lives at the head of the file, so the URL path already fetches only a
 * small Range; this wrapper simply enforces the size cap before parsing.
 */
export async function parseImage(
	source: AsyncIterable<Uint8Array>,
	opts: ImageParseOptions = {},
): Promise<ImageInfo> {
	const maxBytes = opts.maxBytes ?? 4 * 1024 * 1024;
	let total = 0;
	const chunks: Uint8Array[] = [];

	for await (const chunk of source) {
		if (opts.signal?.aborted) {
			throw new ImageParseError("Request aborted", 499);
		}
		total += chunk.byteLength;
		if (total > maxBytes) {
			throw new ImageParseError(
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
	return parseImageBytes(buf, { byteSize: total });
}
