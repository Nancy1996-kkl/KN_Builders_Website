// Post-build static prerender.
// Reads the SSR bundle, renders each route to an HTML string, and injects it
// into the matching dist/*.html so every page ships full, crawlable content
// (great for Google + AI/answer engines) while React still hydrates on load.
//
// Runs after: `vite build` (client) and `vite build --ssr` (server bundle).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SITE, SERVICE_AREA_NAMES } from '../src/site.js'

const root = process.cwd()
const dist = resolve(root, 'dist')
const ssrEntry = resolve(root, '.ssr-dist/entry-server.js')

const PAGES = [
  { key: 'home', file: 'index.html' },
  { key: 'services', file: 'services.html' },
  { key: 'projects', file: 'projects.html' },
  { key: 'blog', file: 'blog.html' },
  { key: 'about', file: 'about.html' },
  { key: 'contact', file: 'contact.html' },
  // Blog articles
  { key: 'post:cost-to-build-house-chennai', file: 'blog/cost-to-build-house-chennai.html' },
  { key: 'post:choosing-a-builder-tambaram', file: 'blog/choosing-a-builder-tambaram.html' },
  { key: 'post:vaastu-modern-homes', file: 'blog/vaastu-modern-homes.html' },
  { key: 'post:successful-construction-project-steps', file: 'blog/successful-construction-project-steps.html' },
  { key: 'post:site-safety-tips', file: 'blog/site-safety-tips.html' },
  { key: 'post:technology-modern-construction', file: 'blog/technology-modern-construction.html' },
  // Service detail pages
  { key: 'svc:residential-construction', file: 'services/residential-construction.html' },
  { key: 'svc:commercial-construction', file: 'services/commercial-construction.html' },
  { key: 'svc:renovation-remodeling', file: 'services/renovation-remodeling.html' },
  { key: 'svc:design-and-planning', file: 'services/design-and-planning.html' },
  { key: 'svc:civil-structural-works', file: 'services/civil-structural-works.html' },
  { key: 'svc:interior-fitout', file: 'services/interior-fitout.html' },
  // Legal
  { key: 'privacy', file: 'privacy.html' },
  { key: 'terms', file: 'terms.html' },
]


// --- NAP guard -------------------------------------------------------------
// Business identity (phone / email / geo) is hand-written into each page <head>
// and its JSON-LD, which historically drifted from src/site.js and shipped
// placeholder contact details into schema that Google + AI engines read.
// This rewrites those identity fields from site.js at build time, so site.js is
// the single source of truth and the two can no longer disagree.
const telSchema = SITE.phone.replace(/\s+/g, '-')   // "+91-82848-47436"
const { lat, lng } = SITE.geo

function syncNap(html) {
  return html
    // meta geo signals
    .replace(/(<meta name="geo\.position" content=")[^"]*(")/g, `$1${lat};${lng}$2`)
    .replace(/(<meta name="ICBM" content=")[^"]*(")/g, `$1${lat}, ${lng}$2`)
    // JSON-LD identity fields
    .replace(/("telephone":\s*")[^"]*(")/g, `$1${telSchema}$2`)
    .replace(/("email":\s*")[^"]*(")/g, `$1${SITE.email}$2`)
    .replace(/("latitude":\s*)-?[\d.]+/g, `$1${lat}`)
    .replace(/("longitude":\s*)-?[\d.]+/g, `$1${lng}`)
    // schema service-area list, kept in step with SERVICE_AREAS in site.js
    .replace(/("areaServed":\s*)\[[^\]]*\]/g, `$1${JSON.stringify(SERVICE_AREA_NAMES)}`)
    // human-readable contact strings in prose (not the hyphenated schema value,
    // which is already set above — hence the negative lookbehind on '"telephone": ')
    .replace(/(?<!"telephone": ")\+91[\s-]\d{5}[\s-]\d{5}/g, SITE.phone)
    .replace(/[a-zA-Z0-9._%+-]+@knbuilders\.com/g, SITE.email)
}

// Replace the dev placeholder content inside <div id="root">…</div> with SSR HTML.
// Anchors on the root open tag and the first <script> after it, so it works
// regardless of Vite's hashed asset names.
function inject(html, appHtml) {
  const startTag = '<div id="root">'
  const start = html.indexOf(startTag)
  if (start === -1) throw new Error('Could not find <div id="root"> in template')
  const afterStart = start + startTag.length
  const scriptIdx = html.indexOf('<script', afterStart)
  const closeIdx = html.lastIndexOf('</div>', scriptIdx)
  return html.slice(0, afterStart) + appHtml + html.slice(closeIdx)
}

async function main() {
  if (!existsSync(ssrEntry)) {
    console.error(`\n[prerender] SSR bundle not found at ${ssrEntry}.`)
    console.error('[prerender] Run the SSR build first: vite build --ssr src/entry-server.jsx --outDir .ssr-dist\n')
    process.exit(1)
  }
  const { render } = await import(pathToFileURL(ssrEntry).href)

  for (const { key, file } of PAGES) {
    const path = resolve(dist, file)
    if (!existsSync(path)) { console.warn(`[prerender] skip (missing): ${file}`); continue }
    const template = readFileSync(path, 'utf8')
    const appHtml = render(key)
    writeFileSync(path, syncNap(inject(template, appHtml)), 'utf8')
    console.log(`[prerender] baked ${file} (${appHtml.length.toLocaleString()} chars)`)
  }
  console.log('[prerender] done.')
}

main().catch((e) => { console.error(e); process.exit(1) })
