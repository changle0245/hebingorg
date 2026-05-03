#!/usr/bin/env node
// Fetch each pinned CDN URL and compute SHA-384 SRI hashes.
// Output: tools/sri-map.json — { url: "sha384-..." }
//
// Skipped (intentionally):
//   - fonts.googleapis.com CSS (rotates internally; SRI would break)
//   - GA / AdSense scripts (versionless, content changes)
//   - pdf.worker.min.js loaded via GlobalWorkerOptions.workerSrc (browsers don't honor SRI on
//     Worker URLs set programmatically)

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const URLS = [
  'https://cdn.jsdelivr.net/npm/diff@5.2.0/dist/diff.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/upng-js/2.1.0/UPNG.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  'https://cdn.jsdelivr.net/npm/@breezystack/lamejs@1.2.7/dist/lamejs.iife.min.js',
  'https://cdn.jsdelivr.net/npm/js-md5@0.7.3/build/md5.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://unpkg.com/docx@8.5.0/build/index.umd.js',
  'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.6.5/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/mupdf@1.27.0/dist/mupdf.js'
];

async function sri(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return 'sha384-' + createHash('sha384').update(buf).digest('base64');
}

const out = {};
for(const url of URLS){
  process.stderr.write(`fetching ${url} ... `);
  try {
    out[url] = await sri(url);
    process.stderr.write('ok\n');
  } catch (e) {
    process.stderr.write(`FAILED: ${e.message}\n`);
    out[url] = null;
  }
}

await writeFile(join(__dirname, 'sri-map.json'), JSON.stringify(out, null, 2) + '\n');
process.stderr.write(`\nWrote tools/sri-map.json (${Object.keys(out).length} entries)\n`);
