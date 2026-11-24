// Read-only release integrity report for the four Fayz Market distributives.
// Prints JSON with size, SHA-256, package/bundle id, version, architecture and signing facts for each file.
//   node scripts/release/artifact-metadata.mjs dist/apk/v1.1.2/fayz-market-customer-debug.apk dist/desktop/....dmg ...
// Nothing is installed, opened or uploaded. A DMG is attached read-only (hdiutil -readonly -nobrowse) and detached.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SDK = process.env.ANDROID_HOME || `${os.homedir()}/.fayz-toolchain/android-sdk`;
const BT = `${SDK}/build-tools/35.0.0`;
const JAVA_HOME = process.env.JAVA_HOME || `${os.homedir()}/.fayz-toolchain/jdk/Contents/Home`;
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

function apk(file) {
  const badging = run(`${BT}/aapt2`, ['dump', 'badging', file]);
  const pkg = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
  const sdk = badging.match(/^(?:minSdkVersion|sdkVersion):'(\d+)'/m)?.[1], target = badging.match(/targetSdkVersion:'(\d+)'/)?.[1];
  const certs = run(`${BT}/apksigner`, ['verify', '--print-certs', '--verbose', file], { env: { ...process.env, JAVA_HOME, PATH: `${JAVA_HOME}/bin:${process.env.PATH}` } });
  const abis = badging.match(/native-code: (.+)/)?.[1] || 'none (Java/WebView only — runs on every ABI)';
  return {
    packageId: pkg?.[1], versionCode: Number(pkg?.[2]), versionName: pkg?.[3], minSdk: Number(sdk), targetSdk: Number(target),
    architecture: abis,
    signing: {
      verified: /^Verifies$/m.test(certs),
      schemes: ['v1', 'v2', 'v3', 'v4'].filter(v => new RegExp(`Verified using ${v} scheme \\(.*\\): true`).test(certs)),
      dn: certs.match(/Signer #1 certificate DN: (.+)/)?.[1],
      certSha256: certs.match(/Signer #1 certificate SHA-256 digest: ([0-9a-f]+)/)?.[1],
    },
    bundledWebAssets: run('unzip', ['-Z1', file]).split('\n').filter(n => n.startsWith('assets/assets/')).map(n => n.slice(14)).sort(),
  };
}

function dmg(file) {
  const mount = mkdtempSync(path.join(os.tmpdir(), 'fayz-dmg-'));
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, file]);
  try {
    const app = readdirSync(mount).find(n => n.endsWith('.app'));
    const appPath = path.join(mount, app);
    const plist = key => run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, path.join(appPath, 'Contents/Info.plist')]).trim();
    const exe = path.join(appPath, 'Contents/MacOS', plist('CFBundleExecutable'));
    // codesign -d writes its report to stderr.
    const signText = execFileSync('/bin/sh', ['-c', `codesign -dv --verbose=2 "${appPath}" 2>&1 || true`], { encoding: 'utf8' });
    let gatekeeper = '';
    try { gatekeeper = execFileSync('/bin/sh', ['-c', `spctl --assess --type execute -vv "${appPath}" 2>&1 || true`], { encoding: 'utf8' }).trim(); } catch { gatekeeper = 'unknown'; }
    return {
      app, bundleId: plist('CFBundleIdentifier'), version: plist('CFBundleShortVersionString'),
      architecture: run('lipo', ['-archs', exe]).trim(),
      signing: { signature: signText.match(/Signature=(.+)/)?.[1] || 'none', teamIdentifier: signText.match(/TeamIdentifier=(.+)/)?.[1] || 'none', gatekeeper },
      hdiutilVerify: /VALID/.test(execFileSync('/bin/sh', ['-c', `hdiutil verify "${file}" 2>&1 || true`], { encoding: 'utf8' })) ? 'VALID' : 'INVALID',
    };
  } finally { run('hdiutil', ['detach', mount, '-quiet']); }
}

function exe(file) {
  const kind = run('file', ['-b', file]).trim();
  const bytes = readFileSync(file);
  // Authenticode lives in the PE certificate table (data directory #4); size 0 means the file is unsigned.
  const pe = bytes.readUInt32LE(0x3c), magic = bytes.readUInt16LE(pe + 24);
  const certSize = bytes.readUInt32LE(pe + 24 + (magic === 0x20b ? 112 : 96) + 4 * 8 + 4);
  return {
    format: kind,
    installer: /Nullsoft/i.test(kind) ? 'NSIS' : 'unknown',
    signing: { authenticode: certSize ? `present (${certSize} bytes)` : 'not signed' },
  };
}

const out = [];
for (const file of process.argv.slice(2)) {
  if (!existsSync(file)) { out.push({ file, error: 'missing' }); continue; }
  const base = { file, bytes: statSync(file).size, sha256: sha256(file) };
  out.push({ ...base, ...(file.endsWith('.apk') ? apk(file) : file.endsWith('.dmg') ? dmg(file) : file.endsWith('.exe') ? exe(file) : {}) });
}
console.log(JSON.stringify(out, null, 2));
