import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['icon', 'adaptive-icon', 'splash']) {
  const location = path.join(root, 'apps/mobile/assets', name);
  await sharp(readFileSync(location + '.svg')).png().toFile(location + '.png');
}
