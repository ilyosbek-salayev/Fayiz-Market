// Fayz Market brand assets — derived ONLY by cropping, padding and resizing the approved originals in
// assets/brand/source/ (nothing is redrawn). Re-run after the originals change:
//
//   node scripts/brand/render-brand.mjs
//
// Outputs
//   packages/ui/src/brand/mark-{light,dark}.webp     in-app symbol (no text), square, same geometry in both modes
//   packages/ui/src/brand/logo-{light,dark}.webp     full lockup (symbol + "FAYZ MARKET") for login / lock screens
//   apps/customer/index.html, apps/admin/index.html  inline splash symbol (data URI, works offline before JS loads)
//   apps/android/{customer,admin}/src/main/res/mipmap-*   launcher: legacy PNG + adaptive (API 26+) layers
//   apps/android/shared/res/drawable-*dpi/ic_stat_fayz.png  monochrome status-bar silhouette of the symbol
//   apps/desktop/build/icon.png                       1024 px desktop icon (electron-builder derives .icns / .ico)
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const at = (...p) => path.join(root, ...p);
const source = name => at('assets/brand/source', name);
const out = (file, buffer) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, buffer); console.log(path.relative(root, file), buffer.length, 'B'); };

/** Bounding box of everything that differs from the corner (background) colour. */
async function content(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 60) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, bg: { r: bg[0], g: bg[1], b: bg[2] } };
}

/**
 * Crops the artwork to its content and centres it on a square of its own background colour so that the content's
 * longer side fills `fill` of the square. Light and dark variants therefore share identical geometry.
 */
async function square(file, size, fill) {
  const box = await content(file);
  const side = Math.round(Math.max(box.width, box.height) / fill);
  const padX = side - box.width, padY = side - box.height;
  const master = await sharp(file).removeAlpha().extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .extend({ left: Math.floor(padX / 2), right: Math.ceil(padX / 2), top: Math.floor(padY / 2), bottom: Math.ceil(padY / 2), background: box.bg })
    .png().toBuffer();
  return { image: sharp(master).resize(size, size, { kernel: 'lanczos3' }), bg: box.bg };
}

const rounded = (size, radius) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
async function roundedSquare(file, size, fill, radiusRatio) {
  const { image } = await square(file, size, fill);
  return image.ensureAlpha().composite([{ input: rounded(size, Math.round(size * radiusRatio)), blend: 'dest-in' }]).png({ compressionLevel: 9 }).toBuffer();
}

// ---------- In-app assets ----------
const brandDir = at('packages/ui/src/brand');
for (const variant of ['light', 'dark']) {
  const mark = await square(source(`fayz-mark-${variant}.png`), 384, 0.86);
  out(path.join(brandDir, `mark-${variant}.webp`), await mark.image.webp({ quality: 92, effort: 6 }).toBuffer());
  // Lockup: crop to content, keep its aspect ratio, add an even 6 % margin.
  const file = source(`fayz-logo-${variant}.png`), box = await content(file);
  const margin = Math.round(Math.max(box.width, box.height) * 0.06);
  const lockup = await sharp(file).removeAlpha().extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .extend({ left: margin, right: margin, top: margin, bottom: margin, background: box.bg }).png().toBuffer();
  out(path.join(brandDir, `logo-${variant}.webp`), await sharp(lockup).resize({ width: 640, kernel: 'lanczos3' }).webp({ quality: 90, effort: 6 }).toBuffer());
}

// ---------- Inline splash (before the JS bundle runs) ----------
const splashUri = async variant => 'data:image/webp;base64,' + (await (await square(source(`fayz-mark-${variant}.png`), 160, 0.86)).image.webp({ quality: 88 }).toBuffer()).toString('base64');
const splash = { light: await splashUri('light'), dark: await splashUri('dark') };
for (const app of ['customer', 'admin']) {
  const file = at('apps', app, 'index.html');
  const html = readFileSync(file, 'utf8');
  const next = html.replace(/(<img class="splash-mark splash-light"[^>]*src=")[^"]*(")/, `$1${splash.light}$2`).replace(/(<img class="splash-mark splash-dark"[^>]*src=")[^"]*(")/, `$1${splash.dark}$2`);
  if (next === html && !html.includes(splash.light)) throw new Error(`${app}/index.html has no splash-mark <img> placeholders`);
  writeFileSync(file, next); console.log(`apps/${app}/index.html splash updated`);
}

// ---------- Android launcher ----------
// Customer: dark symbol (yellow cart on black). Admin: light symbol (on white) — both approved variants; staff who
// have both apps installed can tell them apart at a glance.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [app, variant] of [['customer', 'dark'], ['admin', 'light']]) {
  const res = at('apps/android', app, 'src/main/res');
  const file = source(`fayz-mark-${variant}.png`);
  const { bg } = await square(file, 16, 0.86);
  for (const [density, scale] of Object.entries(densities)) {
    out(path.join(res, `mipmap-${density}`, 'ic_launcher.png'), await roundedSquare(file, Math.round(48 * scale), 0.9, 0.2));
    // Adaptive foreground: 108 dp canvas, the symbol kept inside the centre so every mask shape shows it whole.
    const fg = await square(file, Math.round(108 * scale), 0.58);
    out(path.join(res, `mipmap-${density}`, 'ic_launcher_foreground.png'), await fg.image.png({ compressionLevel: 9 }).toBuffer());
  }
  const hex = '#' + [bg.r, bg.g, bg.b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  out(path.join(res, 'values', 'launcher_colors.xml'), Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by scripts/brand/render-brand.mjs: background of the approved ${variant} symbol. -->\n<resources><color name="fayz_launcher_background">${hex}</color></resources>\n`));
  out(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by scripts/brand/render-brand.mjs -->\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/fayz_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`));
  const legacy = path.join(res, 'drawable-nodpi', 'launcher.png');
  if (existsSync(legacy)) { rmSync(legacy); console.log('removed', path.relative(root, legacy)); }
}

// ---------- Status-bar icon: white silhouette of the symbol on transparency (Android requirement) ----------
{
  const { image } = await square(source('fayz-mark-dark.png'), 384, 0.92);
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const lum = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((lum - 40) * 255 / 80)));
  }
  const silhouette = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  for (const [density, scale] of Object.entries(densities)) out(at('apps/android/shared/res', `drawable-${density}`, 'ic_stat_fayz.png'), await sharp(silhouette).resize(Math.round(24 * scale), Math.round(24 * scale), { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer());
  const vector = at('apps/android/shared/res/drawable/ic_stat_fayz.xml');
  if (existsSync(vector)) { rmSync(vector); console.log('removed', path.relative(root, vector)); }
}

// ---------- Desktop (macOS / Windows) ----------
{
  const tile = await roundedSquare(source('fayz-mark-dark.png'), 824, 0.86, 0.225);
  out(at('apps/desktop/build/icon.png'), await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: tile, left: 100, top: 100 }]).png({ compressionLevel: 9 }).toBuffer());
}
