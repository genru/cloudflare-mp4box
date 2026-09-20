# MP4 Metadata Parsing API (mp4box.js on Cloudflare Workers)

![](https://vid-xhq.xiaohongque.com/6957e1d606646d6d76a7a482/images/79ab25ab42c629f095c740f1c8fc5b22.jpg)

A lightweight API running on Cloudflare Workers that uses **[mp4box.js](https://github.com/gpac/mp4box.js)** to parse MP4 video metadata (duration, codec, resolution, bitrate, per-track info) and return it as JSON. Supports a **URL mode** (the server fetches the remote file) and a **file mode** (POST raw MP4 bytes directly).

> Powered by mp4box.js on Cloudflare Workers.

## Features

- **URL mode**: pass a video URL and the server fetches and parses it — no client-side download needed.
- **Range probing**: regardless of file size, only a few small requests are usually needed to locate `moov`, returning in seconds (see "How it works" below).
- **KV caching**: parsed results for the same URL are cached for 10 minutes, so repeat requests don't re-fetch the remote file.
- **Streaming parse**: chunks are consumed on the fly and parsing stops as soon as `moov` is found, keeping memory usage low. Per-file cap is 200MB.
- **fMP4 / fragmented aware**: can parse the `ftyp + moov + mvex` init segment and reports `fragmented: true`.
- **Built-in demo page**: `GET /` provides an in-browser tester.

## How it works

### URL mode (`fetchAndParseSmart`)

A "head / tail dual-probe + fallback" strategy:

1. **Head probe** `Range: bytes=0-(4MB-1)`
   - If the server ignores `Range` (returns `200`) → parse the full response body as a stream (equivalent to the old behavior).
   - If `206` is returned and the head already contains a complete `moov` (faststart file) → parse and return immediately.
2. **Tail probe** `Range: bytes=(L-4MB)-(L-1)` (`L` obtained from `Content-Range`)
   - Scan the tail bytes to locate `moov`, then feed it to mp4box together with the head's `ftyp` (which supplies brands / mime) → return the result.
   - No matter how large or far away the file is, the transferred size is roughly `4MB + moov size`, independent of total file size.
3. **Fallback**: if `moov` still can't be located (e.g. moov in the middle, larger than 4MB, or the origin doesn't return content length) → fall back to downloading the whole file as a stream. **Worst case = the old behavior, never worse.**

### File mode

The request body (raw MP4 bytes) is passed directly as a `ReadableStream` to mp4box.js, stopping as soon as `moov` is found. This mode has no stable cache key, so it does not use KV caching.

## API Reference

### `GET /api/parse?url=<mp4-url>`

URL mode, convenient for browser / curl calls.

```bash
curl "https://<your-worker>/api/parse?url=https://example.com/video.mp4"
```

### `POST /api/parse`

Two input modes, distinguished by `Content-Type`:

**(A) URL mode** — `Content-Type: application/json`

```bash
curl -X POST https://<your-worker>/api/parse \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/video.mp4"}'
```

**(B) File mode** — `Content-Type: video/mp4 | application/octet-stream`, body is raw MP4 bytes

```bash
curl -X POST https://<your-worker>/api/parse \
  -H 'Content-Type: video/mp4' \
  --data-binary @local.mp4
```

### `GET /` / `GET /ping`

- `/`: in-browser demo / API tester (HTML).
- `/ping`: health check, returns a small JSON `{ "message": "..." }`.

### Response format

Success (HTTP 200):

```json
{
  "success": true,
  "source": "url",
  "cache": "HIT",
  "info": {
    "duration": 10,
    "brands": ["isom", "isom", "iso2", "avc1", "mp41"],
    "mime": "video/mp4; codecs=\"avc1.640032\"; profiles=\"isom,iso2,avc1,mp41\"",
    "isQuickTime": false,
    "overallBitrate": 3996251.2,
    "timescale": 1000,
    "fragmented": false,
    "progressive": true,
    "tracks": [
      {
        "id": 1,
        "type": "video",
        "codec": "avc1.640032",
        "timescale": 15360,
        "nb_samples": 300,
        "language": "und",
        "name": "VideoHandler",
        "bitrate": 3996251.2,
        "width": 1280,
        "height": 720
      }
    ]
  }
}
```

Top-level `info` fields:

| Field | Meaning |
|---|---|
| `duration` | Duration in seconds |
| `brands` | Compatible brands from `ftyp` |
| `mime` | MIME type with codecs (usable directly in `<video>` / `<source>`) |
| `isQuickTime` | Whether this is a QuickTime file |
| `overallBitrate` | Overall bitrate (bps) |
| `timescale` | Timebase |
| `fragmented` | Whether this is a fragmented MP4 (fMP4) |
| `progressive` | Whether this is progressive (moov at the head) |

Per-track `tracks[]`: `id`, `type` (`video`/`audio`/...), `codec`, video `width`/`height`, audio `sampleRate`/`channelCount`, `bitrate`, `timescale`, `nb_samples`, `language`, `name`.

> Note: the API returns a **curated, serializable subset**, not the full `moov` box tree, nor mp4box's raw `Movie` object (to avoid circular references and huge sample arrays).

Error response (HTTP 4xx/5xx):

```json
{ "success": false, "error": "..." }
```

| Status | Trigger |
|---|---|
| `400` | Missing / invalid `url`, or JSON body without `url` |
| `413` | Input exceeds the 200MB cap |
| `422` | `moov` not found (not MP4 / truncated / media segment without init) |
| `502` | Remote fetch failed or upstream returned non-2xx |
| `500` | Unexpected internal error |

The `source` field is `"url"` (URL mode) or `"body"` (file mode). The `cache` field is `"HIT"` (KV cache hit) or `"MISS"` (parsed this request), present only in URL mode.

## Caching

URL-mode results are written to KV, keyed by `mp4:url:<url>`, with a TTL of **10 minutes**. Errors are not cached. When the KV binding is absent, caching is automatically disabled (parse without caching).

## Limits and notes

- **200MB per-file cap**. Because parsing is streaming and stops on `moov`, memory usage is low, but Cloudflare Workers still has a CPU-time limit (free 10s / paid 30s) and 128MB memory. For very large files with `moov` at the tail, the whole file must be streamed through before `moov` is reached.
- **Fragmented / fMP4**: the init segment (`moov` at the head) can be parsed and reports `fragmented: true`; but because we stop on `moov`, subsequent `moof` segments are not accumulated, so `duration` comes only from `moov` (often `0` or just the init-segment value). Per-track codec / resolution / sample rate are accurate, but the total duration across all segments is skewed. A pure media segment (no `moov`) or a live stream cannot be parsed.
- Only `http(s)` URL inputs are supported.

## Local development

```bash
npm install
npm run dev          # wrangler dev (KV is simulated locally by default, no real namespace needed)
```

Smoke test:

```bash
curl "http://localhost:3000/api/parse?url=https://example.com/video.mp4"
```

## Testing

```bash
npm test             # vitest, runs inside workerd
```

Tests cover: streaming parse, "no moov" error, Range-probe helpers (`extractFtyp` / `findMoov` / `ftyp+moov` feeding), and KV caching `MISS → HIT`.

## Deployment

```bash
npm run deploy       # wrangler deploy
```

KV caching requires a namespace:

```bash
npx wrangler kv namespace create mp4_cache
```

Put the returned `id` into `wrangler.jsonc` under `kv_namespaces[].id` (local `wrangler dev --local` works with the placeholder id).

## Image metadata API (image-size on Cloudflare Workers)

A sibling endpoint that parses image metadata — format, dimensions, color type,
alpha, animation, frame count and EXIF (make, model, datetime, DPI, orientation,
GPS) — from a URL or raw bytes. Because image headers always sit at the start of
the file, the URL mode only fetches a small `Range` (512KB head) and, on servers
that ignore `Range`, **stops streaming after the first 512KB** — it never downloads
the whole image, so it returns in seconds regardless of file size.

### `GET /api/image?url=<image-url>`

```bash
curl "https://<your-worker>/api/image?url=https://example.com/image.png"
```

### `POST /api/image`

```bash
# URL mode
curl -X POST https://<your-worker>/api/image \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/image.png"}'

# File mode — raw image bytes
curl -X POST https://<your-worker>/api/image \
  -H 'Content-Type: image/png' \
  --data-binary @image.png
```

### Response

```json
{
  "success": true,
  "source": "url",
  "cache": "MISS",
  "info": {
    "format": "png",
    "mime": "image/png",
    "width": 1280,
    "height": 720,
    "bitDepth": 8,
    "colorType": "rgba",
    "hasAlpha": true,
    "byteSize": 482133,
    "exif": {
      "make": "Canon",
      "model": "Canon EOS 5D",
      "datetime": "2024:01:02 03:04:05",
      "orientation": 1,
      "dpiX": 72,
      "dpiY": 72,
      "gps": { "latitude": 37.7749, "longitude": -122.4194 }
    }
  }
}
```

Supported formats: **PNG, JPEG, GIF, WebP**. `exif` is populated where present
(JPEG APP1, PNG `eXIf`, WebP `EXIF`). Errors mirror the video API
(`400`/`413`/`422`/`502`/`500`); the isolated front page is served at `GET /image`.

## Project structure

```
src/
  index.ts        # Express routes + URL fetch orchestration (Range probing / KV cache)
  mp4-parser.ts   # mp4box.js streaming parse, normalize, Range-probe helpers
  demo.ts         # In-browser tester page served at /
test/
  parse.spec.ts   # vitest cases
wrangler.jsonc    # Worker config + KV binding
```

## Dependencies and license

- Parsing core: [mp4box.js](https://github.com/gpac/mp4box.js) (MIT).
- Runtime platform: Cloudflare Workers (`nodejs_compat`).
