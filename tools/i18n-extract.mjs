#!/usr/bin/env node
// Extract all zh+en strings that lack an Arabic translation.
// Output: tools/i18n-todo.json
//
// Three patterns are extracted:
//   1. Inline FAQ:  data-faq-zh="X" data-faq-en="Y"     (need data-faq-ar)
//   2. Tips lists:  <ul class="zh-tips"><li>...</li></ul>  + en-tips  (need ar-tips clone)
//   3. Placeholders: <input ... placeholder="...">  (need data-placeholder-{zh,en,ar})

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = { faq: {}, tips: {}, placeholder: {} };

function decode(s){
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}

const htmlFiles = (await readdir(ROOT)).filter(f => f.endsWith('.html') && !f.startsWith('_'));

for(const file of htmlFiles){
  const html = await readFile(join(ROOT, file), 'utf8');

  // ---- 1. FAQ pairs ----
  // Match elements with both data-faq-zh="..." and data-faq-en="..." but no data-faq-ar.
  // Tags are usually <h2>, <h3>, <div class="faq-q">, <div class="faq-a">. We just collect
  // pairs by scanning for adjacent attributes within the same tag.
  const faqRe = /<[^>]*?\bdata-faq-zh=("|')((?:(?!\1)[^])*?)\1[^>]*?\bdata-faq-en=("|')((?:(?!\3)[^])*?)\3[^>]*>/g;
  let m;
  const fileFaq = [];
  while((m = faqRe.exec(html)) !== null){
    if(/data-faq-ar=/.test(m[0])) continue;  // already has ar
    fileFaq.push({ zh: decode(m[2]), en: decode(m[4]), ar: null });
  }
  // Also scan with reversed attribute order (en before zh)
  const faqRe2 = /<[^>]*?\bdata-faq-en=("|')((?:(?!\1)[^])*?)\1[^>]*?\bdata-faq-zh=("|')((?:(?!\3)[^])*?)\3[^>]*>/g;
  while((m = faqRe2.exec(html)) !== null){
    if(/data-faq-ar=/.test(m[0])) continue;
    fileFaq.push({ zh: decode(m[4]), en: decode(m[2]), ar: null });
  }
  if(fileFaq.length) out.faq[file] = fileFaq;

  // ---- 2. Tips lists ----
  // Collect each <ul> or <ol> with class containing "zh-tips" or "en-tips" → grab li texts.
  // Skip files that already have ar-tips.
  const tipsRe = /<(ul|ol)\b[^>]*\bclass=("|')([^"']*?\b(zh|en|ar)-tips\b[^"']*)\2[^>]*>([\s\S]*?)<\/\1>/g;
  const fileTips = { zh: null, en: null, ar: null };
  while((m = tipsRe.exec(html)) !== null){
    const lang = m[4];
    const inner = m[5];
    const items = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/g;
    let li;
    while((li = liRe.exec(inner)) !== null){
      items.push(decode(li[1].replace(/<[^>]+>/g, '').trim()));
    }
    fileTips[lang] = items;
  }
  if(fileTips.zh && fileTips.en && !fileTips.ar){
    out.tips[file] = { zh: fileTips.zh, en: fileTips.en, ar: null };
  }

  // ---- 3. Placeholders (only the ones that aren't already keyed by data-placeholder-*) ----
  const phRe = /<(input|textarea)\b[^>]*\bplaceholder=("|')((?:(?!\2)[^])*?)\2[^>]*>/g;
  const filePh = [];
  while((m = phRe.exec(html)) !== null){
    if(/\bdata-placeholder-(zh|en|ar)=/.test(m[0])) continue;  // already converted
    filePh.push({ tag: m[1], current: decode(m[3]), zh: null, en: null, ar: null });
  }
  if(filePh.length) out.placeholder[file] = filePh;
}

await writeFile(join(ROOT, 'tools', 'i18n-todo.json'), JSON.stringify(out, null, 2) + '\n');

const faqCount = Object.values(out.faq).reduce((s, a) => s + a.length, 0);
const tipsCount = Object.keys(out.tips).length;
const phCount = Object.values(out.placeholder).reduce((s, a) => s + a.length, 0);
process.stderr.write(`Extracted: ${faqCount} FAQ entries (across ${Object.keys(out.faq).length} files), ${tipsCount} tips lists, ${phCount} placeholders\n`);
