// Renders the Fayz Market mark (same geometry as packages/ui BrandMark / Android launcher) to
// apps/desktop/build/icon.png (1024 px). electron-builder derives the .icns and .ico from it.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="80" y="80" width="864" height="864" rx="196" fill="#FFCC29"/>
  <g transform="translate(512 512) scale(0.84) translate(-512 -530)">
    <path d="M307 379h410l-28 396c-3 42-38 74-80 74H415c-42 0-77-32-80-74z" fill="#fff" stroke="#1E1E1E" stroke-width="36" stroke-linejoin="round"/>
    <path d="M405 390v-69c0-63 47-112 107-112s107 49 107 112v69" fill="none" stroke="#1E1E1E" stroke-width="40" stroke-linecap="round"/>
    <path d="M450 487v250m0-250h150m-150 110h124" fill="none" stroke="#1E1E1E" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
mkdirSync(path.join(root, 'apps/desktop/build'), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(path.join(root, 'apps/desktop/build/icon.png'));
console.log('apps/desktop/build/icon.png');
