# CLAUDE.md — Pixel Perfect Image Resizer

## Project Overview

**Pixel Perfect** is a client-side image resizing and compression tool. All image processing runs entirely in the browser using the Canvas API and the [Pica.js](https://github.com/nodeca/pica) library (Lanczos3 resampling). No images are uploaded to any server.

- **Live URL**: https://puneetdemon.github.io/pixel-perfect/
- **Analytics backend**: https://pixel-perfect-app.netlify.app (Netlify Functions)

## Tech Stack

- **Vanilla JavaScript** — no framework, no build step, no transpilation
- **Pica.js 9.0.1** (CDN) — Lanczos3 high-quality image resampling with WASM/Web Worker support
- **Google Fonts** (CDN) — DM Sans (body), Playfair Display (heading)
- **Netlify Functions** (ESM) — serverless visit counter backed by Netlify Blobs
- **Deployment**: GitHub Pages (static files) + Netlify (functions)

There is **no package.json, no bundler, no transpiler, no test runner**. The repo is pure HTML/CSS/JS served as-is.

## Repository Structure

```
pixel-perfect/
├── index.html                  # Single-page app entry point (all markup)
├── css/
│   └── resizer.css             # All styles (~629 lines)
├── js/
│   └── resizer.js              # All application logic (~685 lines)
├── netlify/
│   └── functions/
│       └── count.mjs           # Serverless visit counter (ESM, Netlify Functions)
├── robots.txt                  # SEO: allows all crawlers
└── sitemap.xml                 # SEO: single-URL sitemap
```

## Application Architecture

### Entry Points

| File | Role |
|------|------|
| `index.html` | HTML skeleton; loads CSS and scripts |
| `js/resizer.js` | All app logic; linked at bottom of `<body>` |
| `/api/count` | Netlify Function (maps to `netlify/functions/count.mjs`) |

### JavaScript Structure (`js/resizer.js`)

The entire application is split into two IIFEs at the bottom of the file:

**IIFE 1 — Main application** (lines 1–665):

| Section | Lines | Purpose |
|---------|-------|---------|
| DOM refs | 1–42 | All elements cached via `const $ = id => document.getElementById(id)` |
| App state | 44–56 | `originalImage`, `outputFormat`, `aspectLocked`, `resizedBlob`, etc. |
| Crop state | 57–68 | Canvas coordinates, drag mode, locked ratio, fixed size |
| Helpers | 69–122 | `formatFileSize`, `gcd`, `formatAspect`, `formatPixels`, `setStatus`, `updateDesiredStats` |
| File upload | 124–167 | Drag-and-drop + click-to-browse; reads image via `FileReader` |
| Crop module | 201–461 | Canvas crop UI: 8 handles, rule-of-thirds grid, mouse + touch events, aspect presets |
| Resize section | 463–633 | Dimension inputs, quality slider, format/unit buttons, Pica integration, download |
| Reset | 645–664 | Clears all state and UI back to initial |

**IIFE 2 — Analytics** (lines 667–685):
- `POST /api/count` on every page load (fire-and-forget)
- Reveals `#statsOverlay` and fetches visit count only when `?stats` is in the URL

### State Management

All state lives as `let` variables inside the main IIFE — no global variables, no external store:

```js
// App state
let targetUnit       = 'KB';          // 'KB' | 'MB'
let originalImage    = null;           // Image object after upload
let originalFileSize = 0;             // bytes
let originalFileType = '';            // MIME type
let aspectLocked     = true;
let aspectRatio      = 1;             // width / height
let outputFormat     = 'image/jpeg';  // 'image/jpeg' | 'image/png' | 'image/webp'
let resizedBlob      = null;          // Blob of last resize result
let originalFileName = 'image';       // filename stem (no extension)
let resizedPreviewUrl = null;         // object URL (revoked on each new resize)

// Crop state
let cropScale       = 1;    // display-to-image pixel ratio
let cropX, cropY, cropW, cropH;       // canvas coordinates
let cropDragMode    = null;           // handle id | 'move' | 'new' | null
let cropLockedRatio = null;           // null = free, number = W/H ratio
let cropFixedSize   = null;           // { w, h } — fixed output after crop
```

### User Workflow

1. **Upload** — drag-and-drop or click the drop zone; validated by `file.type.startsWith('image/')`
2. **Crop** — canvas-based crop with 8 resize handles and aspect ratio presets (Free, 1:1, 16:9, 4:3, 3:2, 56×56); user clicks "Apply Crop" or "Skip Crop"
3. **Resize** — set target dimensions, quality (10–100%), output format (JPEG/PNG/WebP), and optional target file size in KB/MB
4. **Download** — triggers `<a download>` with appropriate extension

### Image Resize Algorithm

```js
// 1. Lanczos3 upsampling via Pica
const picaInstance = new pica({ features: ['js', 'wasm', 'ww'], idle: 4000 });
await picaInstance.resize(src, dst, { quality: 3, unsharpAmount: 80, unsharpRadius: 0.6, unsharpThreshold: 2 });

// 2. If target file size specified: binary search over quality (12 iterations, 3% tolerance)
let lo = 0.01, hi = 1.0;
for (let i = 0; i < 12; i++) {
  const mid  = (lo + hi) / 2;
  const blob = await picaInstance.toBlob(canvas, outputFormat, mid);
  if (blob.size <= targetBytes) { bestBlob = blob; lo = mid; }
  else hi = mid;
  if (bestBlob && Math.abs(bestBlob.size - targetBytes) / targetBytes < 0.03) break;
}
```

Key constraints enforced at resize time:
- Max dimension: **10,000 px** per side
- PNG is lossless — target file size hint warns user that quality slider won't compress PNGs
- Object URLs are revoked via `URL.revokeObjectURL` on each new resize to prevent memory leaks

## CSS Conventions (`css/resizer.css`)

### Design Tokens (CSS Custom Properties)

```css
--bg:        #0e0f11   /* page background */
--surface:   #16171b   /* card background */
--surface2:  #1e2025   /* secondary surfaces */
--border:    #2a2c32   /* borders */
--text:      #e8e6e3   /* primary text */
--text-dim:  #8a8d95   /* secondary text */
--accent:    #c4f04d   /* lime green — primary accent */
--accent-dim:#a3cc2a   /* dimmer accent */
--danger:    #f04d4d   /* error/destructive */
--radius:    12px      /* standard border radius */
```

Always use these variables for color/radius; do not hardcode hex values unless matching an existing pattern.

### Layout Patterns

- **CSS Grid** for side-by-side preview and stats panels
- **Flexbox** for button rows and inline controls
- **Responsive breakpoint**: `@media (max-width: 640px)` for mobile
- **Animation**: `.fadeUp` keyframe for section reveal; sections animate in via `animation: fadeUp 0.4s ease both`

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| HTML IDs | camelCase | `dropZone`, `cropCanvas`, `qualitySlider` |
| CSS classes | kebab-case | `drop-zone`, `preview-card`, `crop-section` |
| JS variables | camelCase | `originalImage`, `resizedPreviewUrl` |
| JS functions | camelCase | `formatFileSize`, `initCrop`, `highQualityResize` |
| CSS variables | `--kebab-case` | `--accent`, `--text-dim` |

### CSS Section Delimiters

Sections in `resizer.css` are delimited with:
```css
/* ===== SECTION NAME ===== */
```
Maintain this pattern when adding new sections.

## Netlify Function (`netlify/functions/count.mjs`)

- **Runtime**: Netlify Functions (ESM, Node.js)
- **Storage**: Netlify Blobs (`getStore("analytics")`) — key: `"visits"`, value: string integer
- **Routes**:
  - `POST /api/count` — increments visit counter, returns `{ count: N }`
  - `GET /api/count` — returns current `{ count: N }` without incrementing
- Uses `export const config = { path: "/api/count" }` for path mapping

## Development Workflow

### Running Locally

Since there is no build step, serve the static files with any local HTTP server:

```bash
# Python (built-in)
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code Live Server extension also works
```

The Netlify Function (`/api/count`) requires the Netlify CLI to run locally:

```bash
npm install -g netlify-cli
netlify dev   # serves on port 8888, proxies /api/* to functions
```

Without Netlify CLI, analytics calls will silently fail (caught with `.catch(() => {})`) — the app works fine.

### No Build, No Linting

There is no configured linter, formatter, or test suite. Code style is maintained manually:
- Indent with **2 spaces**
- Align variable declarations with padding spaces (see DOM refs block)
- Add `// ── Section name ──` comments to delimit logical blocks inside functions

### Deployment

- **Static files**: Auto-deployed to GitHub Pages on push to `master`
- **Netlify Functions**: Auto-deployed from the `netlify/functions/` directory via Netlify Git integration
- No CI/CD pipeline or pre-commit hooks

## Adding Features — Key Patterns

### Adding a new crop aspect ratio preset

In `index.html`, add a button to the `.crop-aspect-btns` group:
```html
<button class="crop-aspect-btn" data-ratio="1.7778">16:9</button>
<!-- For fixed output size (e.g. 56×56 avatar): -->
<button class="crop-aspect-btn" data-ratio="1" data-fixed-w="56" data-fixed-h="56">56×56</button>
```
No JS changes needed — the event listener in `resizer.js` reads `btn.dataset.ratio` and `btn.dataset.fixedW/H` dynamically.

### Adding a new output format

1. Add a `.format-btn` in `index.html` with `data-fmt="image/newformat"`
2. Extend the `ext` mapping in the `downloadBtn` click handler (`resizer.js:637`)
3. Extend the `fmtMap` in `showResizeSection` (`resizer.js:179`) if display name differs

### Adding a new resize preset

In `index.html`, add a `.preset-btn` with either:
- `data-w="1920" data-h="1080"` — fixed dimensions
- `data-pct="75"` — percentage scale

No JS changes needed.

### Modifying the analytics function

Edit `netlify/functions/count.mjs`. The function uses `@netlify/blobs` which is provided by the Netlify runtime — no local install needed for deployment.

## URL Parameters

| Parameter | Effect |
|-----------|--------|
| `?stats` | Shows the `#statsOverlay` modal with total visit count |

## Important Constraints

- **Max image dimension**: 10,000 px per side (enforced in resize handler)
- **Supported input formats**: Any `image/*` MIME type the browser can decode
- **PNG + target file size**: Binary search is skipped for PNG (lossless format — quality has no effect on size)
- **Memory management**: Always call `URL.revokeObjectURL(resizedPreviewUrl)` before reassigning `resizedPreviewUrl`
- **Crop scale**: `cropScale` maps between canvas display pixels and full-resolution image pixels; always divide by `cropScale` when extracting real pixel coordinates
