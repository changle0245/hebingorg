#!/usr/bin/env node
// Rewrite all HTML files to load libraries from /vendor/ instead of jsdelivr/unpkg/cdnjs.
// Also strips integrity= and crossorigin= attributes/assignments for those URLs, since the
// files are now first-party (SRI is for protecting cross-origin loads from a host you don't
// trust to be untampered with — we don't need it for files served from our own origin).
//
// Run AFTER tools/vendor-sync.mjs has populated /vendor/.
// Idempotent: a second run is a no-op.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REWRITE = JSON.parse(await readFile(join(ROOT, 'tools', 'vendor-rewrite-map.json'), 'utf8'));

function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// One pass per CDN url: replace all occurrences with the local URL, then strip neighboring
// integrity / crossorigin attributes that referred to it.
function rewriteOne(html, cdn, local){
  if(!html.includes(cdn)) return html;
  const re = new RegExp(escapeRegex(cdn), 'g');
  return html.replace(re, local);
}

// After URL replacement, clean up artifacts: integrity="..." and crossorigin="..." on
// script tags whose src is now /vendor/..., and var.integrity= / var.crossOrigin= for dynamic
// loaders. We do this generically — anywhere a /vendor/ URL appears in a <script> or assignment,
// strip the now-redundant integrity/crossorigin annotations on that same tag/statement.
function stripIntegrityFromVendorScriptTags(html){
  // Match <script ... src="/vendor/..." ...></script> and remove integrity= / crossorigin=
  return html.replace(
    /<script\b([^>]*\bsrc=("|')\/vendor\/[^"']+\2[^>]*)><\/script>/g,
    (full, attrs) => {
      let cleaned = attrs
        .replace(/\s+integrity=("|')[^"']*\1/g, '')
        .replace(/\s+crossorigin=("|')[^"']*\1/gi, '');
      return `<script${cleaned}></script>`;
    }
  );
}

function stripIntegrityFromVendorLinkTags(html){
  // Match <link rel="modulepreload" href="/vendor/...">  with optional integrity/crossorigin
  return html.replace(
    /<link\b([^>]*\brel=("|')modulepreload\2[^>]*\bhref=("|')\/vendor\/[^"']+\3[^>]*)>/g,
    (full, attrs) => {
      let cleaned = attrs
        .replace(/\s+integrity=("|')[^"']*\1/g, '')
        .replace(/\s+crossorigin=("|')[^"']*\1/gi, '');
      return `<link${cleaned}>`;
    }
  );
}

function stripIntegrityFromVendorDynamicLoaders(html){
  // Match: <var>.src='/vendor/...';<var>.integrity='...';<var>.crossOrigin='anonymous';
  // We strip the .integrity and .crossOrigin assignments that immediately follow a vendor src.
  // Use a tolerant pattern that stops at the first unrelated statement.
  return html.replace(
    /([\w$]+)\.src\s*=\s*('|")(\/vendor\/[^'"]+)\2\s*;\s*((?:\1\.integrity\s*=\s*('|")[^'"]*\5\s*;\s*)?(?:\1\.crossOrigin\s*=\s*('|")[^'"]*\6\s*;\s*)?)/g,
    (full, varName, q, url) => `${varName}.src=${q}${url}${q};`
  );
}

let changed = 0, total = 0;
const files = (await readdir(ROOT)).filter(f => f.endsWith('.html') && !f.startsWith('_'));
for(const f of files){
  const path = join(ROOT, f);
  const before = await readFile(path, 'utf8');
  let after = before;
  for(const [cdn, local] of Object.entries(REWRITE)){
    after = rewriteOne(after, cdn, local);
  }
  after = stripIntegrityFromVendorScriptTags(after);
  after = stripIntegrityFromVendorLinkTags(after);
  after = stripIntegrityFromVendorDynamicLoaders(after);
  total++;
  if(after !== before){
    await writeFile(path, after);
    changed++;
    process.stderr.write(`  ✓ ${f}\n`);
  }
}
process.stderr.write(`\nDone. ${changed}/${total} files rewritten.\n`);
