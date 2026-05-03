#!/usr/bin/env node
// hebing.org — bulk per-page transform.
//
// What it does, idempotently:
//   1. For every <script src="https://CDN/..."> with a known pinned URL, add integrity + crossorigin
//   2. For every dynamic loader pattern `s.src = 'https://CDN/...'` followed by appendChild, add
//      `s.integrity = 'sha384-...'; s.crossOrigin = 'anonymous';`
//   3. For every `import('https://CDN/...')` of a module, prepend a <link rel="modulepreload"> tag
//      in <head> with integrity + crossorigin (so the browser fetches & verifies once)
//   4. Inject <link rel="stylesheet" href="/common.css"> and <script src="/common.js"></script>
//      into <head>, BEFORE the AdSense <script>, so the consent default is set first
//   5. Update the per-page sw.js fetch hint comment if present (no-op for most pages)
//
// Run:  node tools/apply-fixes.mjs
// Re-run is safe: each transform checks for prior application before modifying.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRI = JSON.parse(await readFile(join(__dirname, 'sri-map.json'), 'utf8'));

// Modules we want to verify via <link rel="modulepreload"> (used by `import()` not <script>)
const MODULE_URLS = new Set([
  'https://cdn.jsdelivr.net/npm/mupdf@1.27.0/dist/mupdf.js'
]);

// Skip from automated SRI handling because they're loaded as Web Workers (workerSrc) — browsers
// don't honor SRI on programmatic Worker URLs as of 2026. We still keep the hash in the map so
// users / future code review can verify manually.
const WORKER_URLS = new Set([
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
]);

const COMMON_CSS_TAG = '<link rel="stylesheet" href="/common.css">';
const COMMON_JS_TAG  = '<script src="/common.js"></script>';

const SUMMARY = { files: 0, changed: 0, sri: 0, dyn: 0, modPreload: 0, common: 0 };

function injectIntegrityIntoStaticScript(html){
  // Match <script ... src="URL" ...></script> — single line. We don't try to handle multi-line
  // tags; the codebase writes script tags on one line.
  let out = html;
  let count = 0;
  out = out.replace(/<script\b([^>]*?)\bsrc=("|')(https:\/\/[^"']+)\2([^>]*)><\/script>/g,
    (full, before, q, url, after) => {
      if(!SRI[url]) return full;          // not a pinned URL we hashed
      if(WORKER_URLS.has(url)) return full;
      if(MODULE_URLS.has(url)) return full;
      if(/\bintegrity=/.test(full)) return full;  // already has SRI
      const hash = SRI[url];
      const hasCO = /\bcrossorigin=/i.test(full);
      const extra = ` integrity=${q}${hash}${q}` + (hasCO ? '' : ` crossorigin=${q}anonymous${q}`);
      count++;
      return `<script${before}src=${q}${url}${q}${after}${extra}></script>`;
    });
  SUMMARY.sri += count;
  return out;
}

function injectIntegrityIntoDynamicLoader(html){
  // Match: s.src = 'https://CDN/...';   OR   s.src='https://CDN/...';
  // We add s.integrity and s.crossOrigin lines immediately after, ONLY if not already present
  // and the URL is in our SRI map. We try to detect both `s.src` and `script.src` patterns.
  let out = html;
  let count = 0;
  // Capture: <var>.src   = 'URL' ;
  // Re-applies cleanly if integrity already exists (we check).
  const re = /([\w$]+)\.src\s*=\s*('|")(https:\/\/[^'"]+)\2\s*;?/g;
  // We must operate on each match with surrounding context to check whether the next ~80
  // chars already contain `.integrity =`.
  out = out.replace(re, (full, varName, q, url, offset, source) => {
    if(!SRI[url]) return full;
    if(WORKER_URLS.has(url)) return full;
    if(MODULE_URLS.has(url)) return full;
    // Look ahead 200 chars for an existing integrity assignment on this var
    const tail = source.slice(offset + full.length, offset + full.length + 200);
    const integrityRe = new RegExp('\\b' + varName.replace(/[$]/g,'\\$') + '\\.integrity\\s*=');
    if(integrityRe.test(tail)) return full;
    count++;
    return `${full}${varName}.integrity=${q}${SRI[url]}${q};${varName}.crossOrigin=${q}anonymous${q};`;
  });
  SUMMARY.dyn += count;
  return out;
}

function injectModulePreload(html){
  // For each module URL we ship, insert one <link rel="modulepreload"> in <head> if a page
  // imports it via `import('URL')`.
  let out = html;
  let count = 0;
  for(const url of MODULE_URLS){
    const importRe = new RegExp("import\\((?:'|\")" + url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:'|\")");
    if(!importRe.test(out)) continue;
    const linkTag = `<link rel="modulepreload" href="${url}" integrity="${SRI[url]}" crossorigin="anonymous">`;
    if(out.includes(linkTag)) continue;
    // Insert before </head>
    out = out.replace(/<\/head>/i, `${linkTag}\n</head>`);
    count++;
  }
  SUMMARY.modPreload += count;
  return out;
}

function injectCommonAssets(html){
  // Insert COMMON_CSS_TAG + COMMON_JS_TAG in <head>, BEFORE the AdSense <script> if found, else
  // before </head>. Idempotent.
  if(html.includes(COMMON_JS_TAG)) return html;
  const adseenseRe = /<script\b[^>]*src=(['"])https:\/\/pagead2\.googlesyndication\.com\/[^'"]+\1[^>]*><\/script>/;
  const m = adseenseRe.exec(html);
  const inject = `${COMMON_CSS_TAG}\n${COMMON_JS_TAG}\n`;
  let out;
  if(m){
    const idx = m.index;
    // walk back to start of line for cleaner diff
    let lineStart = idx;
    while(lineStart > 0 && html[lineStart-1] !== '\n') lineStart--;
    out = html.slice(0, lineStart) + inject + html.slice(lineStart);
  } else {
    out = html.replace(/<\/head>/i, `${inject}</head>`);
  }
  SUMMARY.common++;
  return out;
}

async function processFile(path){
  const before = await readFile(path, 'utf8');
  let after = before;
  after = injectIntegrityIntoStaticScript(after);
  after = injectIntegrityIntoDynamicLoader(after);
  after = injectModulePreload(after);
  after = injectCommonAssets(after);
  if(after !== before){
    await writeFile(path, after);
    SUMMARY.changed++;
    process.stderr.write(`  ✓ ${path.split(/[\\/]/).pop()}\n`);
  }
  SUMMARY.files++;
}

const files = (await readdir(ROOT))
  .filter(f => f.endsWith('.html') && !f.startsWith('_'))
  .map(f => join(ROOT, f));

process.stderr.write(`Processing ${files.length} HTML files...\n`);
for(const f of files) await processFile(f);

process.stderr.write(`\nDone. ${JSON.stringify(SUMMARY, null, 2)}\n`);
