import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
rmSync(path.join(root, 'apps/desktop/web'), { recursive: true, force: true }); // no stale bundles in the installer
mkdirSync(path.join(root, 'apps/desktop/web'), { recursive: true });
cpSync(path.join(root, 'apps/admin/dist'), path.join(root, 'apps/desktop/web'), { recursive: true, force: true });
if (!process.env.VITE_API_URL) throw new Error('VITE_API_URL is required for desktop packaging');
writeFileSync(path.join(root, 'apps/desktop/api-url.json'), JSON.stringify({ apiUrl: process.env.VITE_API_URL }));
