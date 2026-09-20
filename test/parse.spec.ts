import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
	parseMp4,
	tryParseMp4Chunks,
	extractFtyp,
	findMoov,
	type Mp4Chunk,
} from "../src/mp4-parser";
import { sampleMp4Buffer } from "./fixtures/sample";

function streamFromBuffer(buf: ArrayBuffer): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array(buf));
			controller.close();
		},
	});
}

describe("mp4 parser (mp4box in workerd)", () => {
	it("parses a fixture MP4 stream into normalized info", async () => {
		const info = await parseMp4(streamFromBuffer(sampleMp4Buffer()));
		expect(info.duration).toBeGreaterThan(0);
		expect(Array.isArray(info.tracks)).toBe(true);
		expect(info.tracks.length).toBeGreaterThan(0);
		expect(info.tracks.some((t) => t.type === "video")).toBe(true);
		expect(info.brands.length).toBeGreaterThan(0);
	});

	it("rejects input without a moov atom", async () => {
		await expect(
			parseMp4(streamFromBuffer(new TextEncoder().encode("this is not an mp4").buffer)),
		).rejects.toThrow();
	});
});

describe("range probing helpers", () => {
	const toAB = (u8: Uint8Array): ArrayBuffer =>
		u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

	// The fixture is non-faststart: moov sits near the end of the file.
	it("extractFtyp reads the leading ftyp box from the head", () => {
		const bytes = new Uint8Array(sampleMp4Buffer());
		const head = bytes.slice(0, 4096);
		const ftyp = extractFtyp(head);
		expect(ftyp).not.toBeNull();
		expect(ftyp!.length).toBeGreaterThanOrEqual(8);
		// box type bytes at offset 4..8 are 'ftyp'
		expect(String.fromCharCode(...ftyp!.slice(4, 8))).toBe("ftyp");
	});

	it("findMoov locates the trailing moov box in the tail", () => {
		const bytes = new Uint8Array(sampleMp4Buffer());
		const tail = bytes.slice(bytes.length - 2048);
		const moov = findMoov(tail);
		expect(moov).not.toBeNull();
		expect(moov!.size).toBeGreaterThanOrEqual(8);
		expect(moov!.start + moov!.size).toBeLessThanOrEqual(tail.length);
	});

	it("tryParseMp4Chunks returns null when the head has no moov", async () => {
		const bytes = new Uint8Array(sampleMp4Buffer());
		const head = bytes.slice(0, 4096); // moov is at ~15k, well past this
		const info = await tryParseMp4Chunks([{ data: toAB(head), fileStart: 0 }]);
		expect(info).toBeNull();
	});

	it("parses full info from ftyp + moov fetched as separate ranges", async () => {
		const bytes = new Uint8Array(sampleMp4Buffer());
		const head = bytes.slice(0, 4096);
		const tail = bytes.slice(bytes.length - 2048);

		const ftyp = extractFtyp(head)!;
		const moov = findMoov(tail)!;
		const moovBytes = tail.slice(moov.start, moov.start + moov.size);

		const chunks: Mp4Chunk[] = [
			{ data: toAB(ftyp), fileStart: 0 },
			{ data: toAB(moovBytes), fileStart: ftyp.length },
		];
		const info = await tryParseMp4Chunks(chunks);

		expect(info).not.toBeNull();
		expect(info!.duration).toBeGreaterThan(0);
		expect(info!.brands.length).toBeGreaterThan(0);
		expect(info!.tracks.some((t) => t.type === "video")).toBe(true);

		// Sanity: matches a full streaming parse of the same file.
		const full = await parseMp4(streamFromBuffer(sampleMp4Buffer()));
		expect(info!.duration).toBe(full.duration);
		expect(info!.tracks.length).toBe(full.tracks.length);
	});
});

describe("mp4 parse API (HTTP)", () => {
	it("GET returns 400 when the url query param is missing", async () => {
		const res = await SELF.fetch("http://localhost/api/parse");
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.success).toBe(false);
	});

	it("returns 400 when no url is provided in JSON body", async () => {
		const res = await SELF.fetch("http://localhost/api/parse", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.success).toBe(false);
	});
});

describe("kv caching (URL mode)", () => {
	// Uses a small range-supporting public file; validates the 10-minute KV cache
	// skips the remote fetch on a repeat request. Network-dependent, so it is
	// skipped automatically if the upstream is unreachable.
	const url =
		"https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4";

	it("caches a parsed URL and returns HIT on repeat", async () => {
		const r1 = await SELF.fetch(`http://localhost/api/parse?url=${url}`, {
			redirect: "follow",
		});
		if (r1.status !== 200) {
			console.warn("Skipping cache test: upstream unreachable");
			return;
		}
		const d1 = (await r1.json()) as { cache?: string; info: { duration: number } };
		expect(d1.cache).toBe("MISS");

		const r2 = await SELF.fetch(`http://localhost/api/parse?url=${url}`, {
			redirect: "follow",
		});
		const d2 = (await r2.json()) as { cache?: string; info: { duration: number } };
		expect(d2.cache).toBe("HIT");
		expect(d2.info.duration).toBe(d1.info.duration);
	}, 60000);
});
