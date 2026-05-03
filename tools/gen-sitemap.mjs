#!/usr/bin/env node
// Regenerate sitemap.xml from the actual HTML files on disk + git mtime.
// Usage: node tools/gen-sitemap.mjs
//
// Why: hand-maintaining <lastmod> rots — pages get edited and the date stays stale.
// This reads the working tree, picks up every public .html, and stamps lastmod from
// the file's mtime (or git log timestamp if available).

import { readdir, stat, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://hebing.org';

// Pages that should NOT appear in the sitemap
const EXCLUDE = new Set(['404.html', '_next-steps-snippet.html']);

// Per-path priority + changefreq overrides
const META = {
  '/':              { priority: '1.0', changefreq: 'weekly' },
  '/about.html':    { priority: '0.5', changefreq: 'monthly' },
  '/privacy.html':  { priority: '0.3', changefreq: 'monthly' }
};
const DEFAULT = { priority: '0.9', changefreq: 'weekly' };

function gitLastMod(path){
  try {
    const ts = execSync(`git log -1 --format=%cI -- "${path}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if(ts) return ts.slice(0, 10); // YYYY-MM-DD
  } catch(_) {}
  return null;
}

async function fileLastMod(name){
  return gitLastMod(name) || (await stat(join(ROOT, name))).mtime.toISOString().slice(0, 10);
}

const all = await readdir(ROOT);
const htmlFiles = all
  .filter(f => f.endsWith('.html') && !EXCLUDE.has(f))
  .sort((a, b) => {
    if(a === 'index.html') return -1;
    if(b === 'index.html') return 1;
    if(a === 'about.html')   return 1;
    if(b === 'about.html')   return -1;
    if(a === 'privacy.html') return 1;
    if(b === 'privacy.html') return -1;
    return a.localeCompare(b);
  });

const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

for(const name of htmlFiles){
  const path = name === 'index.html' ? '/' : '/' + name;
  const meta = META[path] || DEFAULT;
  const lastmod = await fileLastMod(name);
  lines.push('');
  lines.push('  <url>');
  lines.push(`    <loc>${ORIGIN}${path}</loc>`);
  lines.push(`    <lastmod>${lastmod}</lastmod>`);
  lines.push(`    <changefreq>${meta.changefreq}</changefreq>`);
  lines.push(`    <priority>${meta.priority}</priority>`);
  lines.push('  </url>');
}

lines.push('');
lines.push('</urlset>');

await writeFile(join(ROOT, 'sitemap.xml'), lines.join('\n') + '\n');
process.stderr.write(`Wrote sitemap.xml with ${htmlFiles.length} URLs\n`);
