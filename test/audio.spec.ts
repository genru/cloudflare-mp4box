import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
	detectAudioFormat,
	parseAudioBytes,
	oggDurationFromTail,
	AudioParseError,
} from "../src/audio-parser";

function w16le(buf: Uint8Array, o: number, v: number) {
	buf[o] = v & 0xff;
	buf[o + 1] = (v >> 8) & 0xff;
}
function w32le(buf: Uint8Array, o: number, v: number) {
	buf[o] = v & 0xff;
	buf[o + 1] = (v >> 8) & 0xff;
	buf[o + 2] = (v >> 16) & 0xff;
	buf[o + 3] = (v >>> 24) & 0xff;
}
function w32be(buf: Uint8Array, o: number, v: number) {
	buf[o] = (v >>> 24) & 0xff;
	buf[o + 1] = (v >> 16) & 0xff;
	buf[o + 2] = (v >> 8) & 0xff;
	buf[o + 3] = v & 0xff;
}
function w24be(buf: Uint8Array, o: number, v: number) {
	buf[o] = (v >> 16) & 0xff;
	buf[o + 1] = (v >> 8) & 0xff;
	buf[o + 2] = v & 0xff;
}
function ascii(buf: Uint8Array, o: number, s: string) {
	for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i);
}

function buildWav(): Uint8Array {
	// PCM 44100 Hz stereo 16-bit, data size = 1 second of audio
	const byteRate = 44100 * 2 * 2;
	const dataSize = byteRate;
	const buf = new Uint8Array(12 + 24 + 8);
	ascii(buf, 0, "RIFF");
	w32le(buf, 4, 36 + dataSize);
	ascii(buf, 8, "WAVE");
	ascii(buf, 12, "fmt ");
	w32le(buf, 16, 16);
	w16le(buf, 20, 1); // PCM
	w16le(buf, 22, 2); // channels
	w32le(buf, 24, 44100);
	w32le(buf, 28, byteRate);
	w16le(buf, 32, 4); // block align
	w16le(buf, 34, 16); // bits
	ascii(buf, 36, "data");
	w32le(buf, 40, dataSize);
	return buf;
}

function buildMp3(): Uint8Array {
	const title = "Hello";
	// ID3v2.3 header + TIT2 frame (utf-8 payload)
	const framePayload = 1 + title.length;
	const id3Size = 10 + framePayload;
	const buf = new Uint8Array(10 + id3Size + 4);
	ascii(buf, 0, "ID3");
	buf[3] = 3; // v2.3
	buf[4] = 0;
	buf[5] = 0;
	// syncsafe size
	buf[6] = (id3Size >> 21) & 0x7f;
	buf[7] = (id3Size >> 14) & 0x7f;
	buf[8] = (id3Size >> 7) & 0x7f;
	buf[9] = id3Size & 0x7f;
	ascii(buf, 10, "TIT2");
	w32be(buf, 14, framePayload); // v2.3 plain BE size
	buf[18] = 0;
	buf[19] = 0;
	buf[20] = 3; // utf-8
	ascii(buf, 21, title);
	// MPEG1 Layer III frame: 128 kbps, 44100 Hz, stereo
	const f = 10 + id3Size;
	buf[f] = 0xff;
	buf[f + 1] = 0xfb; // sync + MPEG1 + Layer III
	buf[f + 2] = 0x90; // bitrate idx 9 (128k) + sr idx 0 (44100)
	buf[f + 3] = 0x00; // channel mode: stereo
	return buf;
}

function buildFlac(): Uint8Array {
	const comment = "TITLE=Song";
	// vendor len(4) + count(4) + entry len(4) + entry
	const commentLen = 4 + 4 + 4 + comment.length;
	const buf = new Uint8Array(4 + 4 + 34 + 4 + commentLen);
	ascii(buf, 0, "fLaC");
	// STREAMINFO (not last)
	buf[4] = 0x00;
	w24be(buf, 5, 34);
	// packed 64-bit: sr(20) | ch-1(3) | bps-1(5) | totalSamples(36)
	const combined =
		44100 * 2 ** 44 + (2 - 1) * 2 ** 41 + (16 - 1) * 2 ** 36 + 44100;
	const hi = Math.floor(combined / 2 ** 32);
	const lo = combined % 2 ** 32;
	w32be(buf, 8 + 10, hi);
	w32be(buf, 8 + 14, lo);
	// VORBIS_COMMENT (last)
	const c = 4 + 4 + 34;
	buf[c] = 0x84;
	w24be(buf, c + 1, commentLen);
	let p = c + 4;
	w32le(buf, p, 0); // vendor len
	p += 4;
	w32le(buf, p, 1); // count
	p += 4;
	w32le(buf, p, comment.length);
	p += 4;
	ascii(buf, p, comment);
	return buf;
}

function buildOggIdPage(): Uint8Array {
	// Single BOS page holding a Vorbis identification packet (30 bytes)
	const pkt = new Uint8Array(30);
	pkt[0] = 0x01;
	ascii(pkt, 1, "vorbis");
	w32le(pkt, 7, 0); // version
	pkt[11] = 2; // channels
	w32le(pkt, 12, 44100);
	w32le(pkt, 16, 0); // max
	w32le(pkt, 20, 128000); // nominal
	w32le(pkt, 24, 0); // min
	pkt[28] = 0xb8;
	pkt[29] = 0x01; // framing

	const page = new Uint8Array(27 + 1 + pkt.length);
	ascii(page, 0, "OggS");
	page[4] = 0; // version
	page[5] = 2; // BOS
	// granule 0, serial, seq, crc — left as zeros
	page[26] = 1; // one segment
	page[27] = pkt.length;
	page.set(pkt, 28);
	return page;
}

describe("audio parser", () => {
	it("detects formats from magic bytes", () => {
		expect(detectAudioFormat(buildWav())).toBe("wav");
		expect(detectAudioFormat(buildMp3())).toBe("mp3");
		expect(detectAudioFormat(buildFlac())).toBe("flac");
		expect(detectAudioFormat(buildOggIdPage())).toBe("ogg");
		const ftyp = new Uint8Array(12);
		ascii(ftyp, 4, "ftyp");
		expect(detectAudioFormat(ftyp)).toBe("m4a");
		expect(detectAudioFormat(new Uint8Array(12))).toBeNull();
	});

	it("parses a WAV header (pcm, 44.1k stereo 16-bit, duration)", () => {
		const info = parseAudioBytes(buildWav());
		expect(info.format).toBe("wav");
		expect(info.mime).toBe("audio/wav");
		expect(info.codec).toBe("pcm");
		expect(info.sampleRate).toBe(44100);
		expect(info.channelCount).toBe(2);
		expect(info.bitDepth).toBe(16);
		expect(info.duration).toBe(1);
	});

	it("parses MP3 ID3v2 tags and first frame header", () => {
		const byteSize = 128000; // pretend the full file is 128KB
		const info = parseAudioBytes(buildMp3(), { byteSize });
		expect(info.format).toBe("mp3");
		expect(info.codec).toBe("mp3");
		expect(info.bitrate).toBe(128000);
		expect(info.sampleRate).toBe(44100);
		expect(info.channelCount).toBe(2);
		expect(info.tags?.title).toBe("Hello");
		// CBR estimate: (byteSize - frameOffset) * 8 / bitrate ≈ 8s
		expect(info.duration).toBeGreaterThan(7.9);
		expect(info.duration).toBeLessThan(8.1);
	});

	it("parses FLAC STREAMINFO and Vorbis comments", () => {
		const info = parseAudioBytes(buildFlac());
		expect(info.format).toBe("flac");
		expect(info.codec).toBe("flac");
		expect(info.sampleRate).toBe(44100);
		expect(info.channelCount).toBe(2);
		expect(info.bitDepth).toBe(16);
		expect(info.duration).toBe(1);
		expect(info.tags?.title).toBe("Song");
	});

	it("parses an OGG Vorbis identification header", () => {
		const info = parseAudioBytes(buildOggIdPage());
		expect(info.format).toBe("ogg");
		expect(info.codec).toBe("vorbis");
		expect(info.sampleRate).toBe(44100);
		expect(info.channelCount).toBe(2);
		expect(info.bitrate).toBe(128000);
	});

	it("derives OGG duration from the last page granule", () => {
		const tail = new Uint8Array(64);
		ascii(tail, 37, "OggS");
		// granule = 88200 samples at 44100 Hz -> 2s
		w32le(tail, 37 + 6, 88200);
		w32le(tail, 37 + 10, 0);
		expect(oggDurationFromTail(tail, 44100)).toBe(2);
		expect(oggDurationFromTail(new Uint8Array(8), 44100)).toBeNull();
	});

	it("rejects non-audio input and m4a in the native path", () => {
		expect(() => parseAudioBytes(new Uint8Array(16))).toThrow(AudioParseError);
		const ftyp = new Uint8Array(12);
		ascii(ftyp, 4, "ftyp");
		expect(() => parseAudioBytes(ftyp)).toThrow(AudioParseError);
	});
});

describe("audio parse API (HTTP)", () => {
	it("GET returns 400 when the url query param is missing", async () => {
		const res = await SELF.fetch("http://localhost/api/audio");
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.success).toBe(false);
	});

	it("POST returns 400 when no url is provided in JSON body", async () => {
		const res = await SELF.fetch("http://localhost/api/audio", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.success).toBe(false);
	});

	it("POST parses raw WAV bytes from the request body", async () => {
		const res = await SELF.fetch("http://localhost/api/audio", {
			method: "POST",
			headers: { "Content-Type": "audio/wav" },
			body: buildWav(),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			success: boolean;
			source: string;
			info: { format: string; duration: number; sampleRate: number };
		};
		expect(data.success).toBe(true);
		expect(data.source).toBe("body");
		expect(data.info.format).toBe("wav");
		expect(data.info.duration).toBe(1);
		expect(data.info.sampleRate).toBe(44100);
	});
});
