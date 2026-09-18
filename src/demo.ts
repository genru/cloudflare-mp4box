// Self-contained developer playground + API reference for the MP4 parse API.
// Served at GET /demo. Neo-Brutalism style: thick black borders, hard shadows,
// flat vivid colors, heavy uppercase type. Tailwind CDN for layout + vanilla JS.
// NOTE: this is a TS template literal — avoid backticks and ${ in the content,
// and write \\ where a single backslash should appear in the output.

export const demoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>MP4 Parser API — Inspect MP4 Metadata Online (mp4box.js)</title>
<meta name="description" content="Free developer API to parse MP4 video metadata online. Send a video URL or raw MP4 bytes and get duration, codecs, resolution, bitrate and per-track info back as JSON. Built with mp4box.js on Cloudflare Workers." />
<meta name="keywords" content="mp4 parser, mp4 metadata, mp4box.js, video info api, mp4 codec checker, mp4 duration, video bitrate, parse mp4 online, cloudflare workers api" />
<meta name="author" content="MP4 Parser API" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#FFF7E4" />
<link rel="canonical" href="https://your-worker.workers.dev/demo" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23111111'/><text x='50' y='66' font-size='38' text-anchor='middle' fill='%23FFDE59' font-family='monospace' font-weight='bold'>MP4</text></svg>" />

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="MP4 Parser API" />
<meta property="og:title" content="MP4 Parser API — Inspect MP4 Metadata Online" />
<meta property="og:description" content="Send a video URL or raw MP4 bytes, get duration, codecs, resolution, bitrate and track info as JSON. Free, no auth, powered by mp4box.js on Cloudflare Workers." />
<meta property="og:url" content="https://your-worker.workers.dev/demo" />
<meta property="og:image" content="https://placehold.co/1200x630/111111/FFDE59?text=MP4+Parser+API" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="MP4 Parser API — Inspect MP4 Metadata Online" />
<meta name="twitter:description" content="Send a video URL or raw MP4 bytes, get duration, codecs, resolution, bitrate and track info as JSON. Free, no auth." />
<meta name="twitter:image" content="https://placehold.co/1200x630/111111/FFDE59?text=MP4+Parser+API" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="dns-prefetch" href="https://cdn.tailwindcss.com" />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;900&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;600;800&display=swap" rel="stylesheet" />
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root {
    --paper: #FFF7E4;
    --ink: #111111;
    --yellow: #FFDE59;
    --pink: #FF6B9D;
    --cyan: #67E8F9;
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
    background-image: radial-gradient(rgba(17,17,17,0.07) 1.2px, transparent 1.2px);
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
  .logo-box {
    background: var(--ink);
    color: var(--yellow);
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
    color: var(--yellow);
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
    animation: scroll 22s linear infinite;
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
  .hl-pink { background: var(--pink); }
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
  .btn-primary { background: var(--yellow); color: var(--ink); text-transform: uppercase; letter-spacing: 0.04em; }
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
    background: #FFFCEB;
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
  .tab.active { background: var(--yellow); color: var(--ink); }
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
  .field-name { color: #0E7490; font-weight: 600; }
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
  .dropzone { border-style: dashed; background: #FFF3C4; }
  .dropzone.drag { background: var(--lime); }
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
  .method-get { background: var(--cyan); }
  body { background-image: radial-gradient(rgba(17,17,17,0.05) 1.2px, transparent 1.2px); }

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
  "name": "MP4 Parser API",
  "url": "https://your-worker.workers.dev/demo",
  "description": "Free developer API to parse MP4 video metadata online. Send a video URL or raw MP4 bytes and get duration, codecs, resolution, bitrate and per-track info back as JSON.",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Any",
  "browserRequirements": "Requires JavaScript",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "featureList": "Parse MP4 from URL or raw bytes, streaming moov early-stop, per-track codec/resolution/bitrate/sample info, JSON API, GET and POST endpoints, no authentication"
}
</script>
</head>
<body>
  <nav style="background:#fff;border-bottom:3px solid var(--ink)" class="sticky top-0 z-20" aria-label="Site">
    <div class="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="logo-box">MP4</span>
        <span class="display font-black text-sm uppercase tracking-tight">Parse API</span>
      </div>
      <div class="hidden sm:flex items-center gap-2">
        <span class="tag t-cyan mono">mp4box.js</span>
        <span class="tag t-purple mono">Cloudflare Workers</span>
      </div>
    </div>
  </nav>

  <div class="marquee">
    <div class="marquee-inner"><span>MP4BOX.JS ✦ CLOUDFLARE WORKERS ✦ STREAMING PARSE ✦ MOOV EARLY-STOP ✦ URL OR RAW BYTES ✦ 200MB CAP ✦ EDGE-FAST ✦</span><span>MP4BOX.JS ✦ CLOUDFLARE WORKERS ✦ STREAMING PARSE ✦ MOOV EARLY-STOP ✦ URL OR RAW BYTES ✦ 200MB CAP ✦ EDGE-FAST ✦</span></div>
  </div>

  <header class="max-w-6xl mx-auto px-5 pt-12 pb-10 relative">
    <span class="sticker t-lime hidden md:inline-block" style="top:18px;right:24px">Free ✦ No auth</span>
    <h1 class="hero-h mb-4">MP4 metadata<br/>as an <span class="hl hl-pink">HTTP API</span></h1>
    <p class="text-sm max-w-2xl" style="color:var(--muted)">
      Stream an MP4 — from a URL or raw bytes — into mp4box.js and get structured metadata back.
      Parsing stops as soon as the <code class="mono text-xs px-1.5 py-0.5" style="background:var(--ink);color:var(--yellow)">moov</code> atom is found, so it stays fast and memory-efficient on the edge.
    </p>
    <div class="endpoint mono mt-6 px-4 py-3.5 flex items-center gap-3 text-sm flex-wrap">
      <span class="method-badge mono text-xs px-2.5 py-1">POST</span>
      <span class="text-sm font-semibold">/api/parse</span>
      <span class="hidden md:inline text-xs" style="color:#9CA3AF">· Accept: application/json | video/mp4 · Returns: application/json</span>
      <button class="btn-copy copy-btn mono ml-auto px-2.5 py-1.5" data-copy="POST /api/parse">Copy</button>
    </div>
    <div class="endpoint mono mt-3 px-4 py-3.5 flex items-center gap-3 text-sm flex-wrap">
      <span class="method-badge method-get mono text-xs px-2.5 py-1">GET</span>
      <span class="text-sm font-semibold">/api/parse?url=&lt;video-url&gt;</span>
      <span class="hidden md:inline text-xs" style="color:#9CA3AF">· URL mode only — quick checks, no body needed</span>
      <button class="btn-copy copy-btn mono ml-auto px-2.5 py-1.5" data-copy="GET /api/parse?url=">Copy</button>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-5 pb-16 grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

    <!-- LEFT: API reference -->
    <section class="lg:col-span-3 space-y-8 min-w-0" aria-label="API reference">

      <div class="card p-5">
        <h2 class="card-title t-cyan mb-3">Request</h2>
        <p class="text-xs mb-4" style="color:var(--muted)">Two input modes, one endpoint. The mode is selected by the <code class="mono font-semibold">Content-Type</code> header.</p>

        <div class="space-y-5">
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="tag t-lime mono">QUICKEST</span>
              <span class="text-sm font-bold">GET with query param</span>
            </div>
            <pre class="codeblock p-4 mono">GET /api/parse?url=https://example.com/video.mp4</pre>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="tag t-cyan mono">MODE 1</span>
              <span class="text-sm font-bold">Parse from URL</span>
            </div>
            <pre class="codeblock p-4 mono">POST /api/parse
Content-Type: application/json

{ "url": "https://example.com/video.mp4" }</pre>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="tag t-pink mono">MODE 2</span>
              <span class="text-sm font-bold">Parse from raw bytes</span>
            </div>
            <pre class="codeblock p-4 mono">POST /api/parse
Content-Type: video/mp4

&lt;raw MP4 bytes as the request body&gt;</pre>
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="card-title t-yellow mb-3">Response</h2>
        <p class="text-xs mb-3" style="color:var(--muted)">Example for a 10s clip with one video, one audio and one text track.</p>
        <pre class="codeblock p-4 mono">{
  "success": true,
  "source": "url",
  "info": {
    "duration": 10.026667,
    "brands": ["mp42", "isom", "avc1"],
    "mime": "video/mp4; codecs=\\"avc1.4d400c,mp4a.40.2\\"",
    "isQuickTime": false,
    "overallBitrate": 621714.86,
    "timescale": 90000,
    "fragmented": false,
    "progressive": false,
    "tracks": [
      { "id": 1, "type": "video", "codec": "avc1.4d400c",
        "width": 320, "height": 240, "bitrate": 51472,
        "timescale": 90000, "nb_samples": 250, "language": "und" },
      { "id": 2, "type": "audio", "codec": "mp4a.40.2",
        "sampleRate": 44100, "channelCount": 1, "bitrate": 70303,
        "timescale": 48000, "nb_samples": 45, "language": "und" }
    ]
  }
}</pre>

        <h3 class="display font-black text-sm uppercase mt-6 mb-3">Schema</h3>
        <div class="space-y-2 text-xs mono">
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">success</span><span class="field-type">boolean</span><span style="color:var(--muted)">— request succeeded</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">source</span><span class="field-type">"url" | "body"</span><span style="color:var(--muted)">— which input mode was used</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.duration</span><span class="field-type">number</span><span style="color:var(--muted)">— duration in seconds</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.brands</span><span class="field-type">string[]</span><span style="color:var(--muted)">— major + compatible brands</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.mime</span><span class="field-type">string</span><span style="color:var(--muted)">— MIME type with codecs parameter</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.isQuickTime</span><span class="field-type">boolean</span><span style="color:var(--muted)">— QuickTime brand detected</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.overallBitrate</span><span class="field-type">number</span><span style="color:var(--muted)">— combined bitrate, bits/s</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.timescale</span><span class="field-type">number</span><span style="color:var(--muted)">— movie timescale</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.fragmented / progressive</span><span class="field-type">boolean</span><span style="color:var(--muted)">— fMP4 / progressive download</span></div>
          <div class="schema-row flex gap-3 flex-wrap"><span class="field-name">info.tracks[]</span><span class="field-type">TrackInfo[]</span><span style="color:var(--muted)">— per-track details</span></div>
        </div>

        <div class="codeblock mt-4 p-4 text-xs mono">
          <div class="mb-1.5 font-bold" style="color:var(--yellow)">TrackInfo</div>
          <div style="color:#9CA3AF">id · type ("video" | "audio" | "subtitles" | "metadata" | "other") · codec · bitrate · timescale · nb_samples · language · name</div>
          <div class="mt-1.5"><span class="jk">video tracks:</span> <span style="color:#9CA3AF">width, height</span></div>
          <div class="mt-1"><span class="jk">audio tracks:</span> <span style="color:#9CA3AF">sampleRate, channelCount</span></div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="card-title t-pink mb-4">Errors</h2>
        <div class="space-y-2.5 text-xs mono">
          <div class="flex items-center gap-3"><span class="status-pill status-4 px-2 py-0.5">400</span><span style="color:var(--muted)">Missing or invalid url; non-http(s) scheme</span></div>
          <div class="flex items-center gap-3"><span class="status-pill status-4 px-2 py-0.5">413</span><span style="color:var(--muted)">Input exceeded the 200MB stream cap</span></div>
          <div class="flex items-center gap-3"><span class="status-pill status-4 px-2 py-0.5">422</span><span style="color:var(--muted)">Not an MP4, or moov atom not found</span></div>
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
curl 'https://your-worker.workers.dev/api/parse?url=https://example.com/video.mp4'

# from a URL
curl -X POST https://your-worker.workers.dev/api/parse \\
  -H 'Content-Type: application/json' \\
  -d '{"url": "https://example.com/video.mp4"}'

# from raw bytes
curl -X POST https://your-worker.workers.dev/api/parse \\
  -H 'Content-Type: video/mp4' \\
  --data-binary @video.mp4</pre>
          </div>
        </div>

        <div id="ex-js" class="hidden">
          <div class="relative">
            <button class="btn-copy copy-btn mono absolute top-2 right-2 px-2.5 py-1.5" data-copy-target="js-code">Copy</button>
            <pre id="js-code" class="codeblock p-4 mono">// quick GET (URL mode only)
const res0 = await fetch('/api/parse?url=' + encodeURIComponent(videoUrl));

// from a URL
const res = await fetch('/api/parse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: videoUrl }),
});
const { success, info } = await res.json();

// from a &lt;input type="file"&gt; File/Blob
const res2 = await fetch('/api/parse', {
  method: 'POST',
  headers: { 'Content-Type': 'video/mp4' },
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
    "https://your-worker.workers.dev/api/parse",
    params={"url": "https://example.com/video.mp4"},
)

# from a URL
resp = requests.post(
    "https://your-worker.workers.dev/api/parse",
    json={"url": "https://example.com/video.mp4"},
)
info = resp.json()["info"]

# from raw bytes
with open("video.mp4", "rb") as f:
    resp = requests.post(
        "https://your-worker.workers.dev/api/parse",
        data=f,
        headers={"Content-Type": "video/mp4"},
    )</pre>
          </div>
        </div>
      </div>
    </section>

    <!-- RIGHT: live playground -->
    <section class="lg:col-span-2 lg:sticky lg:top-20 space-y-6 min-w-0" aria-label="Live playground">
      <div class="card p-5 relative">
        <span class="sticker t-lime" style="top:-14px;right:-10px;transform:rotate(6deg)">Live</span>
        <h2 class="card-title t-lime mb-4">Try it live</h2>

        <div class="flex gap-1.5 mb-4">
          <button id="tabUrl" class="tab active mono text-xs px-3 py-1.5">URL</button>
          <button id="tabFile" class="tab mono text-xs px-3 py-1.5">File</button>
        </div>

        <div id="urlPanel">
          <input id="urlInput" type="url" spellcheck="false" placeholder="https://example.com/video.mp4"
            class="input-nb mono w-full px-3.5 py-2.5 text-xs" />
        </div>
        <div id="filePanel" class="hidden">
          <label id="dropzone" class="dropzone input-nb flex flex-col items-center justify-center gap-1.5 px-4 py-7 cursor-pointer text-center">
            <span id="dropLabel" class="text-xs font-medium" style="color:var(--muted)">Drop an MP4 here, or click to browse</span>
            <span id="fileMeta" class="mono text-xs hidden font-bold"></span>
            <input id="fileInput" type="file" accept="video/mp4,.mp4" class="hidden" />
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
    <span class="mono">POST /api/parse</span> · built with mp4box.js on Cloudflare Workers
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
    var base = location.origin + '/api/parse';
    if (mode === 'url') {
      var url = $('urlInput').value.trim() || 'https://example.com/video.mp4';
      return "curl -X POST '" + base + "' \\\n  -H 'Content-Type: application/json' \\\n  -d '" + JSON.stringify({ url: url }) + "'";
    }
    var name = ($('fileInput').files[0] && $('fileInput').files[0].name) || 'video.mp4';
    return "curl -X POST '" + base + "' \\\n  -H 'Content-Type: video/mp4' \\\n  --data-binary @" + name;
  }
  function updatePreview() {
    $('reqPreview').textContent = buildCurl();
    var link = $('getLink');
    var url = $('urlInput').value.trim();
    if (mode === 'url' && url) {
      link.href = location.origin + '/api/parse?url=' + encodeURIComponent(url);
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
        resp = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: $('urlInput').value.trim() }),
        });
      } else {
        var file = $('fileInput').files[0];
        if (!file) {
          renderResponse(0, 0, 'Choose an MP4 file first.', null);
          setLoading(false);
          return;
        }
        resp = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'video/mp4' },
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
