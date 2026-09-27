// Self-contained developer playground + API reference for the audio info API.
// Served at GET /audio. Neo-Brutalism style: thick black borders, hard shadows,
// flat vivid colors, heavy uppercase type. Tailwind CDN for layout + vanilla JS.
// NOTE: this is a TS template literal — avoid backticks and ${ in the content,
// and write \\ where a single backslash should appear in the output.

export const audioDemoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Audio Info API — Inspect Audio Metadata Online (MP3 / WAV / FLAC / OGG / M4A)</title>
<meta name="description" content="Free developer API to parse audio metadata online. Send an audio URL or raw bytes and get format, codec, duration, bitrate, sample rate, channels, bit depth and tags (title, artist, album, year, genre, track) back as JSON. Built on Cloudflare Workers." />
<meta name="keywords" content="audio info api, audio metadata, id3 reader, mp3 bitrate, wav info, flac metadata, ogg vorbis, opus info, m4a metadata, parse audio online, cloudflare workers api" />
<meta name="author" content="Audio Info API" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#FFF4E0" />
<link rel="canonical" href="https://your-worker.workers.dev/audio" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23111111'/><text x='50' y='66' font-size='34' text-anchor='middle' fill='%23FBBF24' font-family='monospace' font-weight='bold'>AUD</text></svg>" />

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Audio Info API" />
<meta property="og:title" content="Audio Info API — Inspect Audio Metadata Online" />
<meta property="og:description" content="Send an audio URL or raw bytes, get format, codec, duration, bitrate, sample rate and tags as JSON. Free, no auth, on Cloudflare Workers." />
<meta property="og:url" content="https://your-worker.workers.dev/audio" />
<meta property="og:image" content="https://placehold.co/1200x630/111111/FBBF24?text=Audio+Info+API" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Audio Info API — Inspect Audio Metadata Online" />
<meta name="twitter:description" content="Send an audio URL or raw bytes, get format, codec, duration, bitrate, sample rate and tags as JSON. Free, no auth." />
<meta name="twitter:image" content="https://placehold.co/1200x630/111111/FBBF24?text=Audio+Info+API" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="dns-prefetch" href="https://cdn.tailwindcss.com" />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;900&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;600;800&display=swap" rel="stylesheet" />
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root {
    --paper: #FFF4E0;
    --ink: #111111;
    --cyan: #67E8F9;
    --yellow: #FFDE59;
    --pink: #FF6B9D;
    --lime: #BFFF00;
    --purple: #C4B5FD;
    --green: #4ADE80;
    --red: #FF6B6B;
    --amber: #FBBF24;
    --code-bg: #14141F;
    --muted: #52525B;
    --shadow: rgba(17,17,17,0.16);
  }
  * { font-family: 'Space Grotesk', system-ui, sans-serif; }
  h1, h2, h3, .display { font-family: 'Archivo', sans-serif; }
  code, pre, .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  body {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    background-color: var(--paper);
    background-image: radial-gradient(rgba(17,17,17,0.06) 1.2px, transparent 1.2px);
    background-size: 22px 22px;
  }
  .card {
    background: #fff;
    border: 3px solid var(--ink);
    box-shadow: 8px 8px 0 var(--ink);
  }
  .card-title {
    display: inline-block;
    font-family: 'Archivo', sans-serif;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 13px;
    padding: 5px 14px;
    border: 3px solid var(--ink);
    box-shadow: 4px 4px 0 var(--ink);
  }
  .t-cyan { background: var(--cyan); }
  .t-yellow { background: var(--yellow); }
  .t-pink { background: var(--pink); }
  .t-purple { background: var(--purple); }
  .t-lime { background: var(--lime); }
  .t-amber { background: var(--amber); }
  .logo-box {
    background: var(--ink);
    color: var(--amber);
    font-family: 'Archivo', sans-serif;
    font-weight: 900;
    font-size: 13px;
    padding: 4px 8px;
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 rgba(17,17,17,0.35);
  }
  .tag {
    border: 2px solid var(--ink);
    box-shadow: 3px 3px 0 var(--ink);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
  }
  .marquee {
    background: var(--ink);
    color: var(--amber);
    border-top: 3px solid var(--ink);
    border-bottom: 3px solid var(--ink);
    overflow: hidden;
    white-space: nowrap;
  }
  .marquee-inner {
    display: inline-block;
    font-family: 'Archivo', sans-serif;
    font-weight: 900;
    font-size: 13px;
    letter-spacing: 0.08em;
    padding: 8px 0;
    animation: scroll 24s linear infinite;
  }
  .marquee-inner span { padding-right: 24px; }
  @keyframes scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  .sticker {
    position: absolute;
    font-family: 'Archivo', sans-serif;
    font-weight: 900;
    font-size: 12px;
    text-transform: uppercase;
    padding: 6px 12px;
    border: 3px solid var(--ink);
    box-shadow: 4px 4px 0 var(--ink);
    transform: rotate(-6deg);
  }
  .hero-h {
    font-weight: 900;
    font-size: clamp(30px, 5vw, 52px);
    line-height: 1.05;
    text-transform: uppercase;
    letter-spacing: -0.01em;
  }
  .hl { padding: 0 0.18em; border: 3px solid var(--ink); box-shadow: 5px 5px 0 var(--ink); display: inline-block; }
  .hl-amber { background: var(--amber); }
  .hl-cyan { background: var(--cyan); }
  .endpoint {
    background: var(--ink);
    color: #fff;
    border: 3px solid var(--ink);
    box-shadow: 8px 8px 0 rgba(17,17,17,0.35);
  }
  .method-badge {
    background: var(--green);
    color: var(--ink);
    border: 2px solid #000;
    box-shadow: 3px 3px 0 #000;
    font-weight: 800;
  }
  .btn {
    border: 3px solid var(--ink);
    box-shadow: 5px 5px 0 var(--ink);
    font-weight: 800;
    transition: transform .1s ease, box-shadow .1s ease;
    cursor: pointer;
  }
  .btn:hover { transform: translate(2px, 2px); box-shadow: 3px 3px 0 var(--ink); }
  .btn:active { transform: translate(5px, 5px); box-shadow: 0 0 0 var(--ink); }
  .btn:disabled { opacity: .55; transform: none; box-shadow: 5px 5px 0 var(--ink); cursor: progress; }
  .btn-primary { background: var(--amber); color: var(--ink); text-transform: uppercase; letter-spacing: 0.04em; }
  .btn-copy {
    background: #fff;
    color: var(--ink);
    border: 2px solid var(--ink);
    box-shadow: 3px 3px 0 var(--ink);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: transform .1s ease, box-shadow .1s ease;
    cursor: pointer;
  }
  .btn-copy:hover { transform: translate(1px, 1px); box-shadow: 2px 2px 0 var(--ink); }
  .btn-copy:active { transform: translate(3px, 3px); box-shadow: 0 0 0 var(--ink); }
  .btn-dark { background: var(--purple); }
  .input-nb {
    background: #fff;
    border: 3px solid var(--ink);
    transition: box-shadow .12s ease, background .12s ease;
  }
  .input-nb:focus {
    outline: none;
    background: #FFFBF0;
    box-shadow: 4px 4px 0 var(--ink);
  }
  .tab {
    background: #fff;
    border: 2px solid var(--ink);
    box-shadow: 3px 3px 0 var(--ink);
    font-weight: 700;
    color: var(--muted);
    transition: all .1s ease;
    cursor: pointer;
  }
  .tab:hover { color: var(--ink); transform: translate(1px, 1px); box-shadow: 2px 2px 0 var(--ink); }
  .tab.active { background: var(--amber); color: var(--ink); }
  .codeblock {
    background: var(--code-bg);
    border: 3px solid var(--ink);
    box-shadow: 6px 6px 0 var(--ink);
    color: #E5E7EB;
    font-size: 12.5px;
    line-height: 1.7;
    overflow-x: auto;
  }
  .jk { color: #67E8F9; }
  .js { color: #86EFAC; }
  .jn { color: #FBBF24; }
  .jb { color: #C4B5FD; }
  .field-name { color: #B45309; font-weight: 600; }
  .field-type { color: #BE185D; }
  .schema-row { border-bottom: 2px dashed rgba(17,17,17,0.15); padding-bottom: 6px; }
  .schema-row:last-child { border-bottom: none; }
  .status-pill { border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); font-weight: 800; color: var(--ink); }
  .status-2 { background: var(--green); }
  .status-4 { background: var(--amber); }
  .status-5, .status-0 { background: var(--red); }
  .spinner {
    width: 16px; height: 16px; border-radius: 9999px;
    border: 3px solid rgba(17,17,17,0.25); border-top-color: var(--ink);
    animation: spin .7s linear infinite; display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-in { animation: fade .25s ease both; }
  @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .dropzone { border-style: dashed; background: #FFEECC; }
  .dropzone.drag { background: var(--amber); }
  ::-webkit-scrollbar { height: 8px; width: 8px; }
  ::-webkit-scrollbar-thumb { background: var(--ink); border-radius: 8px; }

  /* Softer, rounded neo-brutalism (overrides above) */
  .card { border-radius: 18px; }
  .endpoint { border-radius: 16px; }
  .codeblock { border-radius: 14px; }
  .card-title, .logo-box, .sticker, .hl, .btn, .input-nb, .dropzone { border-radius: 12px; }
  .tab, .method-badge, .card-title { border-radius: 10px; }
  .status-pill { border-radius: 8px; }
  .tag, .btn-copy { border-radius: 999px; }
  .method-get { background: var(--amber); }

  /* Lighter shadows */
  .card { box-shadow: 4px 4px 0 var(--shadow); }
  .endpoint { box-shadow: 4px 4px 0 var(--shadow); }
  .codeblock { box-shadow: 3px 3px 0 var(--shadow); }
  .card-title, .sticker, .hl { box-shadow: 3px 3px 0 var(--shadow); }
  .tag, .logo-box, .method-badge, .status-pill, .tab, .btn-copy { box-shadow: 2px 2px 0 var(--shadow); }
  .tab:hover { box-shadow: 1px 1px 0 var(--shadow); }
  .btn { box-shadow: 4px 4px 0 var(--shadow); }
  .btn:hover { box-shadow: 2px 2px 0 var(--shadow); }
  .btn:active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--shadow); }
  .btn:disabled { box-shadow: 4px 4px 0 var(--shadow); }
  .btn-copy:hover { box-shadow: 1px 1px 0 var(--shadow); }
  .input-nb:focus { box-shadow: 3px 3px 0 var(--shadow); }
</style>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Audio Info API",
  "url": "https://your-worker.workers.dev/audio",
  "description": "Free developer API to parse audio metadata online. Send an audio URL or raw bytes and get format, codec, duration, bitrate, sample rate and tags back as JSON.",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Any",
  "browserRequirements": "Requires JavaScript",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "featureList": "Parse MP3/WAV/FLAC/OGG/M4A from URL or raw bytes, Range head-probe with early-stop, OGG tail-probe duration, M4A moov probing, codec, duration, bitrate, sample rate, channels, bit depth, ID3v2/ID3v1/Vorbis/LIST tags, JSON API, GET and POST endpoints, no authentication"
}
</script>
</head>
<body>
  <nav style="background:#fff;border-bottom:3px solid var(--ink)" class="sticky top-0 z-20" aria-label="Site">
    <div class="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="logo-box">AUD</span>
        <span class="display font-black text-sm uppercase tracking-tight">Info API</span>
      </div>
      <div class="hidden sm:flex items-center gap-2">
        <span class="tag t-amber mono">ID3 · Vorbis</span>
        <span class="tag t-purple mono">Cloudflare Workers</span>
      </div>
    </div>
  </nav>

  <div class="marquee">
    <div class="marquee-inner"><span>ID3V2 ✦ VORBIS COMMENTS ✦ RANGE HEAD-PROBE ✦ OGG TAIL-PROBE ✦ MP3 · WAV · FLAC · OGG · M4A ✦ URL OR RAW BYTES ✦ CLOUDFLARE WORKERS ✦ EDGE-FAST ✦</span><span>ID3V2 ✦ VORBIS COMMENTS ✦ RANGE HEAD-PROBE ✦ OGG TAIL-PROBE ✦ MP3 · WAV · FLAC · OGG · M4A ✦ URL OR RAW BYTES ✦ CLOUDFLARE WORKERS ✦ EDGE-FAST ✦</span></div>
  </div>

  <header class="max-w-6xl mx-auto px-5 pt-12 pb-10 relative">
    <span class="sticker t-lime hidden md:inline-block" style="top:18px;right:24px">Free ✦ No auth</span>
    <h1 class="hero-h mb-4">Audio metadata<br/>as an <span class="hl hl-amber">HTTP API</span></h1>
    <p class="text-sm max-w-2xl" style="color:var(--muted)">
      Send an audio file — from a URL or raw bytes — and get format, codec, duration, bitrate, sample rate, channels and tags back.
      Headers always sit at the start, so only a small <code class="mono text-xs px-1.5 py-0.5" style="background:var(--ink);color:var(--amber)">Range</code> head is fetched — with a tiny tail probe for OGG duration and M4A moov — fast for any file size.
    </p>
    <div class="endpoint mono mt-6 px-4 py-3.5 flex items-center gap-3 text-sm flex-wrap">
      <span class="method-badge mono text-xs px-2.5 py-1">POST</span>
      <span class="text-sm font-semibold">/api/audio</span>
      <span class="hidden md:inline text-xs" style="color:#9CA3AF">· Accept: application/json | audio/mpeg | audio/wav | audio/flac | audio/ogg | audio/mp4 · Returns: application/json</span>
      <button class="btn-copy copy-btn mono ml-auto px-2.5 py-1.5" data-copy="POST /api/audio">Copy</button>
    </div>
    <div class="endpoint mono mt-3 px-4 py-3.5 flex items-center gap-3 text-sm flex-wrap">
      <span class="method-badge method-get mono text-xs px-2.5 py-1">GET</span>
      <span class="text-sm font-semibold">/api/audio?url=&lt;audio-url&gt;</span>
      <span class="hidden md:inline text-xs" style="color:#9CA3AF">· URL mode only — quick checks, no body needed</span>
      <button class="btn-copy copy-btn mono ml-auto px-2.5 py-1.5" data-copy="GET /api/audio?url=">Copy</button>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-5 pb-16 grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

    <!-- LEFT: API reference -->
    <section class="lg:col-span-3 space-y-8 min-w-0" aria-label="API reference">

      <div class="card p-5">
        <h2 class="card-title t-amber mb-3">Request</h2>
        <p class="text-xs mb-4" style="color:var(--muted)">Two input modes, one endpoint. The mode is selected by the <code class="mono font-semibold">Content-Type</code> header.</p>

        <div class="space-y-5">
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="tag t-lime mono">QUICKEST</span>
              <span class="text-sm font-bold">GET with query param</span>
            </div>
            <pre class="codeblock p-4 mono">GET /api/audio?url=https://example.com/song.mp3</pre>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="tag t-amber mono">MODE 1</span>
              <span class="text-sm font-bold">Parse from URL</span>
            </div>
            <pre class="codeblock p-4 mono">POST /api/audio
Content-Type: application/json

{ "url": "https://example.com/song.mp3" }</pre>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="tag t-pink mono">MODE 2</span>
              <span class="text-sm font-bold">Parse from raw bytes</span>
            </div>
            <pre class="codeblock p-4 mono">POST /api/audio
Content-Type: audio/mpeg

&lt;raw audio bytes as the request body&gt;</pre>
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="card-title t-yellow mb-3">Response</h2>
        <p class="text-xs mb-3" style="color:var(--muted)">Example for a 320 kbps MP3 with ID3v2 tags.</p>
        <pre class="codeblock p-4 mono">{
  "success": true,
  "source": "url",
  "cache": "MISS",
  "info": {
    "format": "mp3",
    "mime": "audio/mpeg",
    "codec": "mp3",
    "duration": 213.504,
    "bitrate": 320000,
    "sampleRate": 44100,
    "channelCount": 2,
    "byteSize": 8547321,
    "tags": {
      "title": "Blue in Green",
      "artist": "Miles Davis",
      "album": "Kind of Blue",
      "year": "1959",
      "genre": "Jazz",
      "track": "3/5"
    }
  }
}</pre>

        <h3 class="display font-black text-sm uppercase mt-6 mb-3">Schema</h3>
        <div class="space-y-2 text-xs mono">
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">success</span><span class="field-type">boolean</span><span style="color:var(--muted)">— request succeeded</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">source</span><span class="field-type">"url" | "body"</span><span style="color:var(--muted)">— which input mode was used</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">cache</span><span class="field-type">"HIT" | "MISS"</span><span style="color:var(--muted)">— URL mode only, KV cache state</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.format</span><span class="field-type">"mp3" | "wav" | "flac" | "ogg" | "m4a"</span><span style="color:var(--muted)">— detected from magic bytes</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.mime</span><span class="field-type">string</span><span style="color:var(--muted)">— e.g. audio/mpeg</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.codec</span><span class="field-type">string</span><span style="color:var(--muted)">— mp3 · pcm · flac · vorbis · opus · mp4a.*</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.duration</span><span class="field-type">number</span><span style="color:var(--muted)">— seconds (estimated for CBR MP3)</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.bitrate</span><span class="field-type">number</span><span style="color:var(--muted)">— bits per second</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.sampleRate / channelCount</span><span class="field-type">number</span><span style="color:var(--muted)">— e.g. 44100 / 2</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.bitDepth</span><span class="field-type">number</span><span style="color:var(--muted)">— WAV / FLAC only</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.byteSize</span><span class="field-type">number</span><span style="color:var(--muted)">— total size (remote, from headers)</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.tags</span><span class="field-type">object</span><span style="color:var(--muted)">— title, artist, album, albumArtist, year, genre, track, comment</span></div>
        </div>

        <div class="codeblock mt-4 p-4 text-xs mono">
          <div class="mb-1.5 font-bold" style="color:var(--amber)">Tags</div>
          <div style="color:#9CA3AF">title · artist · album · albumArtist · year · genre · track · comment</div>
          <div class="mt-1.5"><span class="jk">sources:</span> <span style="color:#9CA3AF">ID3v2 / ID3v1 (MP3) · LIST INFO (WAV) · Vorbis comments (FLAC / OGG / Opus)</span></div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="card-title t-pink mb-4">Errors</h2>
        <div class="space-y-2.5 text-xs mono">
          <div class="flex items-center gap-3"><span class="status-pill status-4 px-2 py-0.5">400</span><span style="color:var(--muted)">Missing or invalid url; non-http(s) scheme</span></div>
          <div class="flex items-center gap-3"><span class="status-pill status-4 px-2 py-0.5">413</span><span style="color:var(--muted)">Input exceeded the size cap (head probe / full fallback)</span></div>
          <div class="flex items-center gap-3"><span class="status-pill status-4 px-2 py-0.5">422</span><span style="color:var(--muted)">Not a supported audio file, or metadata unreadable</span></div>
          <div class="flex items-center gap-3"><span class="status-pill status-5 px-2 py-0.5">502</span><span style="color:var(--muted)">Upstream URL unreachable or non-200</span></div>
          <div class="flex items-center gap-3"><span class="status-pill status-5 px-2 py-0.5">500</span><span style="color:var(--muted)">Internal error</span></div>
        </div>
      </div>

      <div class="card p-5">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 class="card-title t-purple">Client examples</h2>
          <div class="flex gap-1.5">
            <button class="tab active ex-tab mono text-xs px-3 py-1.5" data-ex="curl">cURL</button>
            <button class="tab ex-tab mono text-xs px-3 py-1.5" data-ex="js">JavaScript</button>
            <button class="tab ex-tab mono text-xs px-3 py-1.5" data-ex="py">Python</button>
          </div>
        </div>

        <div id="ex-curl">
          <div class="relative">
            <button class="btn-copy copy-btn mono absolute top-2 right-2 px-2.5 py-1.5" data-copy-target="curl-code">Copy</button>
            <pre id="curl-code" class="codeblock p-4 mono"># quick GET (URL mode only)
curl 'https://your-worker.workers.dev/api/audio?url=https://example.com/song.mp3'

# from a URL
curl -X POST https://your-worker.workers.dev/api/audio \\
  -H 'Content-Type: application/json' \\
  -d '{"url": "https://example.com/song.mp3"}'

# from raw bytes
curl -X POST https://your-worker.workers.dev/api/audio \\
  -H 'Content-Type: audio/mpeg' \\
  --data-binary @song.mp3</pre>
          </div>
        </div>

        <div id="ex-js" class="hidden">
          <div class="relative">
            <button class="btn-copy copy-btn mono absolute top-2 right-2 px-2.5 py-1.5" data-copy-target="js-code">Copy</button>
            <pre id="js-code" class="codeblock p-4 mono">// quick GET (URL mode only)
const res0 = await fetch('/api/audio?url=' + encodeURIComponent(audioUrl));

// from a URL
const res = await fetch('/api/audio', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: audioUrl }),
});
const { success, info } = await res.json();

// from a &lt;input type="file"&gt; File/Blob
const res2 = await fetch('/api/audio', {
  method: 'POST',
  headers: { 'Content-Type': file.type || 'audio/mpeg' },
  body: file,
});</pre>
          </div>
        </div>

        <div id="ex-py" class="hidden">
          <div class="relative">
            <button class="btn-copy copy-btn mono absolute top-2 right-2 px-2.5 py-1.5" data-copy-target="py-code">Copy</button>
            <pre id="py-code" class="codeblock p-4 mono">import requests

# quick GET (URL mode only)
resp = requests.get(
    "https://your-worker.workers.dev/api/audio",
    params={"url": "https://example.com/song.mp3"},
)

# from a URL
resp = requests.post(
    "https://your-worker.workers.dev/api/audio",
    json={"url": "https://example.com/song.mp3"},
)
info = resp.json()["info"]

# from raw bytes
with open("song.mp3", "rb") as f:
    resp = requests.post(
        "https://your-worker.workers.dev/api/audio",
        data=f,
        headers={"Content-Type": "audio/mpeg"},
    )</pre>
          </div>
        </div>
      </div>
    </section>

    <!-- RIGHT: live playground -->
    <section class="lg:col-span-2 lg:sticky lg:top-20 space-y-6 min-w-0" aria-label="Live playground">
      <div class="card p-5 relative">
        <span class="sticker t-lime" style="top:-14px;right:-10px;transform:rotate(6deg)">Live</span>
        <h2 class="card-title t-amber mb-4">Try it live</h2>

        <div class="flex gap-1.5 mb-4">
          <button id="tabUrl" class="tab active mono text-xs px-3 py-1.5">URL</button>
          <button id="tabFile" class="tab mono text-xs px-3 py-1.5">File</button>
        </div>

        <div id="urlPanel">
          <input id="urlInput" type="url" spellcheck="false" placeholder="https://example.com/song.mp3"
            class="input-nb mono w-full px-3.5 py-2.5 text-xs" />
        </div>
        <div id="filePanel" class="hidden">
          <label id="dropzone" class="dropzone input-nb flex flex-col items-center justify-center gap-1.5 px-4 py-7 cursor-pointer text-center">
            <span id="dropLabel" class="text-xs font-medium" style="color:var(--muted)">Drop an audio file here, or click to browse</span>
            <span id="fileMeta" class="mono text-xs hidden font-bold"></span>
            <input id="fileInput" type="file" accept="audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/mp4,.mp3,.wav,.flac,.ogg,.opus,.m4a" class="hidden" />
          </label>
        </div>

        <div class="mt-4">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-bold uppercase" style="color:var(--muted)">Request</span>
            <button class="btn-copy copy-btn mono px-2 py-1" data-copy-target="reqPreview">Copy</button>
          </div>
          <pre id="reqPreview" class="codeblock p-3 mono text-xs whitespace-pre-wrap" style="box-shadow:3px 3px 0 var(--shadow)"></pre>
        </div>

        <button id="sendBtn" class="btn btn-primary w-full mt-4 px-4 py-3 text-sm flex items-center justify-center gap-2">
          <span id="btnLabel">Send request</span>
        </button>
        <a id="getLink" href="#" target="_blank" rel="noopener" class="hidden mt-3 mono text-xs font-bold text-center underline">Open as GET ↗</a>
      </div>

      <div id="respCard" class="card p-5 hidden">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div class="flex items-center gap-2">
            <span id="statusPill" class="status-pill mono text-xs px-2.5 py-1">—</span>
            <span id="respMeta" class="mono text-xs font-semibold" style="color:var(--muted)"></span>
          </div>
          <div class="flex items-center gap-1.5">
            <button id="tabPretty" class="tab active mono text-xs px-2.5 py-1">Pretty</button>
            <button id="tabRaw" class="tab mono text-xs px-2.5 py-1">Raw</button>
            <button class="btn-copy copy-btn mono px-2 py-1" data-copy-target="respRaw">Copy</button>
          </div>
        </div>
        <pre id="respPretty" class="codeblock p-4 mono max-h-96 overflow-auto"></pre>
        <pre id="respRaw" class="codeblock p-4 mono max-h-96 overflow-auto hidden"></pre>
      </div>
    </section>
  </main>

  <footer class="max-w-6xl mx-auto px-5 pb-10 text-xs font-semibold" style="color:var(--muted)">
    <span class="mono">POST /api/audio</span> · MP3 · WAV · FLAC · OGG · M4A · powered by a zero-dependency parser on Cloudflare Workers
  </footer>

<script>
  var $ = function (id) { return document.getElementById(id); };

  // ---------- copy buttons ----------
  function flash(btn, text) {
    var prev = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = prev; }, 1200);
  }
  function copyText(btn, text) {
    function done() { flash(btn, 'Copied'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
  }
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-copy-target');
      var text = btn.getAttribute('data-copy');
      if (target) {
        var el = $(target);
        text = el ? (el.textContent || '') : '';
      }
      if (text) copyText(btn, text);
    });
  });

  // ---------- code example tabs ----------
  document.querySelectorAll('.ex-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.ex-tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      ['curl', 'js', 'py'].forEach(function (name) {
        $('ex-' + name).classList.toggle('hidden', name !== btn.getAttribute('data-ex'));
      });
    });
  });

  // ---------- input mode tabs ----------
  var mode = 'url';
  function setMode(m) {
    mode = m;
    $('urlPanel').classList.toggle('hidden', m !== 'url');
    $('filePanel').classList.toggle('hidden', m !== 'file');
    $('tabUrl').classList.toggle('active', m === 'url');
    $('tabFile').classList.toggle('active', m === 'file');
    updatePreview();
  }
  $('tabUrl').addEventListener('click', function () { setMode('url'); });
  $('tabFile').addEventListener('click', function () { setMode('file'); });

  // ---------- request preview ----------
  function buildCurl() {
    var base = location.origin + '/api/audio';
    if (mode === 'url') {
      var url = $('urlInput').value.trim() || 'https://example.com/song.mp3';
      return "curl -X POST '" + base + "' \\\n  -H 'Content-Type: application/json' \\\n  -d '" + JSON.stringify({ url: url }) + "'";
    }
    var name = ($('fileInput').files[0] && $('fileInput').files[0].name) || 'song.mp3';
    return "curl -X POST '" + base + "' \\\n  -H 'Content-Type: audio/mpeg' \\\n  --data-binary @" + name;
  }
  function updatePreview() {
    $('reqPreview').textContent = buildCurl();
    var link = $('getLink');
    var url = $('urlInput').value.trim();
    if (mode === 'url' && url) {
      link.href = location.origin + '/api/audio?url=' + encodeURIComponent(url);
      link.classList.remove('hidden');
      link.classList.add('block');
    } else {
      link.classList.add('hidden');
      link.classList.remove('block');
    }
  }
  $('urlInput').addEventListener('input', updatePreview);

  // ---------- file input + drag & drop ----------
  function setFile(file) {
    if (!file) return;
    var dt = new DataTransfer();
    dt.items.add(file);
    $('fileInput').files = dt.files;
    $('dropLabel').textContent = file.name;
    var meta = $('fileMeta');
    meta.textContent = (file.size / 1024).toFixed(1) + ' KB';
    meta.classList.remove('hidden');
    updatePreview();
  }
  $('fileInput').addEventListener('change', function () { setFile($('fileInput').files[0]); });
  var dz = $('dropzone');
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
  });
  dz.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setFile(f);
  });

  // ---------- JSON syntax highlighting (no regex, template-literal safe) ----------
  function esc(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function isNumChar(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 48 && c <= 57) || ch === 'e' || ch === 'E' || ch === '+' || ch === '-' || ch === '.';
  }
  function highlight(json) {
    var s = JSON.stringify(json, null, 2);
    var out = '', i = 0, n = s.length;
    while (i < n) {
      var c = s.charAt(i);
      if (c === '"') {
        var j = i + 1;
        while (j < n) {
          if (s.charCodeAt(j) === 92) { j += 2; continue; }
          if (s.charAt(j) === '"') { j++; break; }
          j++;
        }
        var tok = s.slice(i, j);
        var k = j;
        while (k < n && s.charAt(k) === ' ') k++;
        var cls = s.charAt(k) === ':' ? 'jk' : 'js';
        out += '<span class="' + cls + '">' + esc(tok) + '</span>';
        i = j;
      } else if (c === '-' || (c >= '0' && c <= '9')) {
        var j2 = i + 1;
        while (j2 < n && isNumChar(s.charAt(j2))) j2++;
        out += '<span class="jn">' + esc(s.slice(i, j2)) + '</span>';
        i = j2;
      } else if (s.slice(i, i + 4) === 'true') { out += '<span class="jb">true</span>'; i += 4; }
      else if (s.slice(i, i + 5) === 'false') { out += '<span class="jb">false</span>'; i += 5; }
      else if (s.slice(i, i + 4) === 'null') { out += '<span class="jb">null</span>'; i += 4; }
      else { out += esc(c); i++; }
    }
    return out;
  }

  // ---------- send request ----------
  function setLoading(loading) {
    $('sendBtn').disabled = loading;
    $('btnLabel').textContent = loading ? 'Parsing…' : 'Send request';
    var spin = $('spin');
    if (loading && !spin) {
      var s = document.createElement('span');
      s.id = 'spin';
      s.className = 'spinner';
      $('sendBtn').prepend(s);
    } else if (!loading && spin) { spin.remove(); }
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function renderResponse(status, ms, text, data) {
    var pill = $('statusPill');
    var cls = 'status-' + (status === 0 ? 0 : Math.floor(status / 100));
    pill.className = 'status-pill mono text-xs px-2.5 py-1 ' + cls;
    pill.textContent = status === 0 ? 'NET ERR' : 'HTTP ' + status;
    $('respMeta').textContent = ms + ' ms · ' + fmtBytes(text.length);
    var pretty = data ? highlight(data) : esc(text);
    $('respPretty').innerHTML = pretty;
    $('respRaw').textContent = text;
    $('respCard').classList.remove('hidden');
    $('respCard').classList.add('fade-in');
    showRespTab('pretty');
  }
  function showRespTab(which) {
    $('tabPretty').classList.toggle('active', which === 'pretty');
    $('tabRaw').classList.toggle('active', which === 'raw');
    $('respPretty').classList.toggle('hidden', which !== 'pretty');
    $('respRaw').classList.toggle('hidden', which !== 'raw');
  }
  $('tabPretty').addEventListener('click', function () { showRespTab('pretty'); });
  $('tabRaw').addEventListener('click', function () { showRespTab('raw'); });

  $('sendBtn').addEventListener('click', async function () {
    setLoading(true);
    var start = performance.now();
    try {
      var resp;
      if (mode === 'url') {
        resp = await fetch('/api/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: $('urlInput').value.trim() }),
        });
      } else {
        var file = $('fileInput').files[0];
        if (!file) {
          renderResponse(0, 0, 'Choose an audio file first.', null);
          setLoading(false);
          return;
        }
        resp = await fetch('/api/audio', {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'audio/mpeg' },
          body: file,
        });
      }
      var text = await resp.text();
      var ms = Math.round(performance.now() - start);
      var data = null;
      try { data = JSON.parse(text); } catch (e) {}
      renderResponse(resp.status, ms, text, data);
    } catch (e) {
      renderResponse(0, Math.round(performance.now() - start), 'Network error: ' + (e.message || e), null);
    } finally {
      setLoading(false);
    }
  });

  setMode('url');
</script>
</body>
</html>`;
