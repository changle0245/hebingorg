#!/usr/bin/env node
// Patch the 8 known sites where URL.createObjectURL had no matching revokeObjectURL.
// Idempotent: each replacement is a no-op if already applied.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Each entry: [filename, [from, to]...]
const PATCHES = [
  ['merge-image.html',
    [`const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='合并图片.pdf';a.click();`,
     `const a=document.createElement('a');const __dlUrl=URL.createObjectURL(blob);a.href=__dlUrl;a.download='合并图片.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(__dlUrl),60000);`]
  ],
  ['merge-pdf.html',
    [`const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='合并文档.pdf';a.click();`,
     `const a=document.createElement('a');const __dlUrl=URL.createObjectURL(blob);a.href=__dlUrl;a.download='合并文档.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(__dlUrl),60000);`]
  ],
  ['merge-ppt.html',
    [`const a=document.createElement('a');a.href=URL.createObjectURL(out);a.download='合并演示文稿.pptx';a.click();`,
     `const a=document.createElement('a');const __dlUrl=URL.createObjectURL(out);a.href=__dlUrl;a.download='合并演示文稿.pptx';a.click();setTimeout(()=>URL.revokeObjectURL(__dlUrl),60000);`]
  ],
  ['word-to-pdf.html',
    [`const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fname;a.click();`,
     `const a=document.createElement('a');const __dlUrl=URL.createObjectURL(blob);a.href=__dlUrl;a.download=fname;a.click();setTimeout(()=>URL.revokeObjectURL(__dlUrl),60000);`]
  ],
  // pdf-split.html — only the 3rd createObjectURL site (the page-range path) lacks revoke
  ['pdf-split.html',
    [`      const blob=new Blob([bytes],{type:'application/pdf'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);
      a.download=\`\${baseName}_p\${from}-\${to}.pdf\`;a.click();
      fill.style.width='100%';`,
     `      const blob=new Blob([bytes],{type:'application/pdf'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);
      a.download=\`\${baseName}_p\${from}-\${to}.pdf\`;a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),60000);
      fill.style.width='100%';`]
  ],
  ['pdf-edit.html',
    [`  const url = URL.createObjectURL(new Blob([dlBytes], { type: 'application/pdf' }));
  $('dlBtn').href = url; $('dlBtn').download = fname;`,
     `  if(window.__hbDlUrl){ URL.revokeObjectURL(window.__hbDlUrl); }
  const url = URL.createObjectURL(new Blob([dlBytes], { type: 'application/pdf' }));
  window.__hbDlUrl = url;
  $('dlBtn').href = url; $('dlBtn').download = fname;`]
  ],
  ['pdf-encrypt.html',
    [`  const url = URL.createObjectURL(new Blob([dlBytes], { type: 'application/pdf' }));
  $('dlBtn').href = url; $('dlBtn').download = fname;`,
     `  if(window.__hbDlUrl){ URL.revokeObjectURL(window.__hbDlUrl); }
  const url = URL.createObjectURL(new Blob([dlBytes], { type: 'application/pdf' }));
  window.__hbDlUrl = url;
  $('dlBtn').href = url; $('dlBtn').download = fname;`]
  ],
  ['regex.html',
    [`  const blob = new Blob([WORKER_SRC], { type:'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}`,
     `  const blob = new Blob([WORKER_SRC], { type:'application/javascript' });
  const u = URL.createObjectURL(blob);
  const w = new Worker(u);
  URL.revokeObjectURL(u);  // Worker holds its own reference once instantiated
  return w;
}`]
  ]
];

let total = 0, skipped = 0;
for(const [file, [from, to]] of PATCHES){
  const path = join(ROOT, file);
  const src = await readFile(path, 'utf8');
  if(src.includes(to)){ skipped++; process.stderr.write(`  - ${file}: already patched\n`); continue; }
  if(!src.includes(from)){ process.stderr.write(`  ! ${file}: source pattern not found — manual review needed\n`); continue; }
  await writeFile(path, src.replace(from, to));
  total++;
  process.stderr.write(`  ✓ ${file}\n`);
}
process.stderr.write(`\nPatched ${total}, skipped ${skipped}.\n`);
