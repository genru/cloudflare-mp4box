import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
	parseImageBytes,
	parseTiffExif,
	ImageParseError,
} from "../src/image-parser";

function b64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

// 1x1 transparent PNG
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// 1x1 transparent GIF
const GIF_1X1 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
// 1x1 lossy WebP
const WEBP_1X1 = "UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

describe("image parser (image-size + custom readers)", () => {
	it("parses a PNG into width/height/format/mime", () => {
		const info = parseImageBytes(b64ToBytes(PNG_1X1));
		expect(info.format).toBe("png");
		expect(info.mime).toBe("image/png");
		expect(info.width).toBe(1);
		expect(info.height).toBe(1);
	});

	it("parses a GIF and reports a single static frame", () => {
		const info = parseImageBytes(b64ToBytes(GIF_1X1));
		expect(info.format).toBe("gif");
		expect(info.mime).toBe("image/gif");
		expect(info.width).toBe(1);
		expect(info.height).toBe(1);
		expect(info.frameCount).toBe(1);
		expect(info.animated).toBe(false);
	});

	it("parses a WebP into width/height/format", () => {
		const info = parseImageBytes(b64ToBytes(WEBP_1X1));
		expect(info.format).toBe("webp");
		expect(info.mime).toBe("image/webp");
		expect(info.width).toBe(1);
		expect(info.height).toBe(1);
	});

	it("reads VP8X flags (alpha + animation) from a crafted WebP", () => {
		const buf = new Uint8Array(30);
		const set = (o: number, ...v: number[]) => v.forEach((x, i) => (buf[o + i] = x));
		set(0, 0x52, 0x49, 0x46, 0x46); // RIFF
		set(4, 0x16, 0, 0, 0); // file size (unused)
		set(8, 0x57, 0x45, 0x42, 0x50); // WEBP
		set(12, 0x56, 0x50, 0x38, 0x58); // VP8X
		set(16, 0x0a, 0, 0, 0); // chunk size = 10
		set(20, 0x12, 0, 0, 0); // flags: alpha(0x02) | anim(0x10)
		set(24, 0x63, 0, 0); // width-1 = 99
		set(27, 0x31, 0, 0); // height-1 = 49
		const info = parseImageBytes(buf);
		expect(info.format).toBe("webp");
		expect(info.width).toBe(100);
		expect(info.height).toBe(50);
		expect(info.hasAlpha).toBe(true);
		expect(info.animated).toBe(true);
	});

	it("rejects non-image input", () => {
		expect(() => parseImageBytes(b64ToBytes("bm90IGFuIGltYWdl"))).toThrow(ImageParseError);
	});
});

describe("EXIF / TIFF parser", () => {
	function buildTiff(): Uint8Array {
		const b = new Uint8Array(0xe8);
		const w16 = (o: number, v: number) => { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; };
		const w32 = (o: number, v: number) => {
			b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; b[o + 2] = (v >> 16) & 0xff; b[o + 3] = (v >>> 24) & 0xff;
		};
		b[0] = 0x49; b[1] = 0x49;
		w16(2, 42);
		w32(4, 8); // IFD0 at 8
		w16(8, 5); // 5 entries
		// Entry1: Orientation (SHORT=3) = 6
		w16(0x0a, 0x0112); w16(0x0c, 3); w32(0x0e, 1); w32(0x12, 6);
		// Entry2: Make (ASCII) -> "Canon\0" at 0x4a
		w16(0x16, 0x010f); w16(0x18, 2); w32(0x1a, 5); w32(0x1e, 0x4a);
		// Entry3: Model (ASCII) -> "EOS_5D\0" at 0x50
		w16(0x22, 0x0110); w16(0x24, 2); w32(0x26, 8); w32(0x2a, 0x50);
		// Entry4: Exif sub-IFD pointer (LONG) -> 0x58
		w16(0x2e, 0x8769); w16(0x30, 4); w32(0x32, 1); w32(0x36, 0x58);
		// Entry5: GPS Info pointer (LONG) -> 0x7e
		w16(0x3a, 0x8825); w16(0x3c, 4); w32(0x3e, 1); w32(0x42, 0x7e);
		w32(0x46, 0); // next IFD
		// Make
		"Canon".split("").forEach((c, i) => (b[0x4a + i] = c.charCodeAt(0)));
		b[0x4f] = 0;
		// Model
		"EOS_5D".split("").forEach((c, i) => (b[0x50 + i] = c.charCodeAt(0)));
		b[0x57] = 0;
		// Exif sub-IFD at 0x58
		w16(0x58, 1);
		w16(0x5a, 0x9003); w16(0x5c, 2); w32(0x5e, 20); w32(0x62, 0x6a);
		w32(0x66, 0);
		// DateTimeOriginal
		"2024:01:02 03:04:05".split("").forEach((c, i) => (b[0x6a + i] = c.charCodeAt(0)));
		b[0x6a + 19] = 0;
		// GPS IFD at 0x7e
		w16(0x7e, 4);
		w16(0x80, 0x0001); w16(0x82, 2); w32(0x84, 2); w32(0x88, 0xb4); // lat ref "N\0"
		w16(0x8c, 0x0002); w16(0x8e, 5); w32(0x90, 3); w32(0x94, 0xb8); // lat rationals
		w16(0x98, 0x0003); w16(0x9a, 2); w32(0x9c, 2); w32(0xa0, 0xb6); // lon ref "W\0"
		w16(0xa4, 0x0004); w16(0xa6, 5); w32(0xa8, 3); w32(0xac, 0xd0); // lon rationals
		w32(0xb0, 0);
		// GPS refs
		b[0xb4] = 0x4e; b[0xb5] = 0; // N
		b[0xb6] = 0x57; b[0xb7] = 0; // W
		// lat = [37/1, 46/1, 30/1]
		const rat = (o: number, n: number, d: number) => { w32(o, n); w32(o + 4, d); };
		rat(0xb8, 37, 1); rat(0xc0, 46, 1); rat(0xc8, 30, 1);
		// lon = [122/1, 25/1, 10/1]
		rat(0xd0, 122, 1); rat(0xd8, 25, 1); rat(0xe0, 10, 1);
		return b;
	}

	it("extracts orientation, make, model, datetime and GPS", () => {
		const exif = parseTiffExif(buildTiff());
		expect(exif).not.toBeNull();
		expect(exif!.orientation).toBe(6);
		expect(exif!.make).toBe("Canon");
		expect(exif!.model).toBe("EOS_5D");
		expect(exif!.datetime).toBe("2024:01:02 03:04:05");
		expect(exif!.gps).toEqual({ latitude: 37.775, longitude: -122.419444 });
	});

	it("returns null for non-TIFF garbage", () => {
		expect(parseTiffExif(b64ToBytes("bm90YWlmZg=="))).toBeNull();
	});
});

describe("image parse API (HTTP)", () => {
	it("GET returns 400 when the url query param is missing", async () => {
		const res = await SELF.fetch("http://localhost/api/image");
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.success).toBe(false);
	});

	it("POST returns 400 when no url is provided in JSON body", async () => {
		const res = await SELF.fetch("http://localhost/api/image", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.success).toBe(false);
	});

	it("caches a parsed URL and returns HIT on repeat", async () => {
		const url = "https://www.gstatic.com/webp/gallery/1.png";
		const r1 = await SELF.fetch(`http://localhost/api/image?url=${url}`, { redirect: "follow" });
		if (r1.status !== 200) {
			console.warn("Skipping image cache test: upstream unreachable");
			return;
		}
		const d1 = (await r1.json()) as { success: boolean; cache?: string; info: { width: number } };
		expect(d1.success).toBe(true);
		expect(d1.cache).toBe("MISS");

		const r2 = await SELF.fetch(`http://localhost/api/image?url=${url}`, { redirect: "follow" });
		const d2 = (await r2.json()) as { success: boolean; cache?: string; info: { width: number } };
		expect(d2.success).toBe(true);
		expect(d2.cache).toBe("HIT");
		expect(d2.info.width).toBe(d1.info.width);
	}, 60000);
});
