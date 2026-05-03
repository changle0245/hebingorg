#!/usr/bin/env node
// Download all CDN libraries into hebing/vendor/<lib>@<version>/<filename>
// so the site no longer depends on jsdelivr / unpkg / cdnjs at runtime.
//
// Why: SRI on a third-party CDN URL only protects against passive tampering. If the CDN host
// is compromised, served-then-cached, or republishes the same version with new content, SRI
// catches the failure but breaks the page. Self-hosting eliminates the supply chain entirely;
// the file is now first-party and version-pinned by URL path.
//
// Re-run: idempotent — skips files already on disk with the recorded SRI hash.

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'vendor');

// Map: CDN URL -> local path under /vendor/
// Convention: /vendor/<libName>@<version>/<filename>, regardless of which CDN it came from.
const MAPPING = [
  ['https://cdn.jsdelivr.net/npm/diff@5.2.0/dist/diff.min.js',                          'diff@5.2.0/diff.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',                  'jszip@3.10.1/jszip.min.js'],
  ['https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',                              'pdf-lib@1.17.1/pdf-lib.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',                 'pdf.js@3.11.174/pdf.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',          'pdf.js@3.11.174/pdf.worker.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',                     'pako@2.1.0/pako.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/upng-js/2.1.0/UPNG.js',                      'upng-js@2.1.0/UPNG.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',               'xlsx@0.18.5/xlsx.full.min.js'],
  ['https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',                     'papaparse@5.4.1/papaparse.min.js'],
  ['https://cdn.jsdelivr.net/npm/@breezystack/lamejs@1.2.7/dist/lamejs.iife.min.js',    'lamejs@1.2.7/lamejs.iife.min.js'],
  ['https://cdn.jsdelivr.net/npm/js-md5@0.7.3/build/md5.min.js',                        'js-md5@0.7.3/md5.min.js'],
  ['https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',                 'qrcode-generator@1.4.4/qrcode.min.js'],
  ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',                              'jsqr@1.4.0/jsQR.js'],
  ['https://unpkg.com/docx@8.5.0/build/index.umd.js',                                   'docx@8.5.0/index.umd.js'],
  ['https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.6.5/dist/pdf-lib.min.js',            'cantoo-pdf-lib@2.6.5/pdf-lib.min.js'],
  ['https://cdn.jsdelivr.net/npm/mupdf@1.27.0/dist/mupdf.js',                           'mupdf@1.27.0/mupdf.js'],
  // mupdf.js dynamically imports siblings — fetch them too. Discovered by grepping mupdf.js
  // after the first download; if mupdf changes its bundle layout in a future version this
  // list must be revisited.
  ['https://cdn.jsdelivr.net/npm/mupdf@1.27.0/dist/mupdf-wasm.js',                      'mupdf@1.27.0/mupdf-wasm.js'],
  ['https://cdn.jsdelivr.net/npm/mupdf@1.27.0/dist/mupdf-wasm.wasm',                    'mupdf@1.27.0/mupdf-wasm.wasm']
];

async function exists(p){ try { await access(p); return true; } catch { return false; } }

function sha384(buf){
  return 'sha384-' + createHash('sha384').update(buf).digest('base64');
}

const sriMap = {};        // CDN url -> "sha384-..."
const urlRewrite = {};    // CDN url -> /vendor/... local path

let downloaded = 0, skipped = 0, totalBytes = 0;
for(const [cdn, local] of MAPPING){
  const localPath = join(VENDOR, local);
  const localUrl  = '/vendor/' + local;
  urlRewrite[cdn] = localUrl;
  await mkdir(dirname(localPath), { recursive: true });

  let buf;
  if(await exists(localPath)){
    buf = await readFile(localPath);
    skipped++;
    process.stderr.write(`  - ${local} (cached, ${(buf.length/1024).toFixed(1)} KB)\n`);
  } else {
    process.stderr.write(`  ↓ ${local} ... `);
    const res = await fetch(cdn);
    if(!res.ok) throw new Error(`${cdn}: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    await writeFile(localPath, buf);
    downloaded++;
    process.stderr.write(`${(buf.length/1024).toFixed(1)} KB\n`);
  }
  totalBytes += buf.length;
  sriMap[cdn] = sha384(buf);
}

await writeFile(join(ROOT, 'tools', 'sri-map.json'), JSON.stringify(sriMap, null, 2) + '\n');
await writeFile(join(ROOT, 'tools', 'vendor-rewrite-map.json'), JSON.stringify(urlRewrite, null, 2) + '\n');

process.stderr.write(`\nDownloaded ${downloaded}, cached ${skipped}, total ${(totalBytes/1024).toFixed(0)} KB\n`);
process.stderr.write(`Wrote tools/sri-map.json and tools/vendor-rewrite-map.json\n`);
