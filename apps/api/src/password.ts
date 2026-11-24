// Cloudflare Workers' WebCrypto rejects PBKDF2 above 100 000 iterations
// ("Pbkdf2 failed: iteration counts above 100000 are not supported"), so new hashes use that maximum.
// Local `wrangler dev` does not enforce the limit, which is why the old value only failed in production.
export const PBKDF2_ITERATIONS = 100_000;
// Hashes written before this fix have the form `salt:hash` and were derived with 310 000 iterations.
// They exist only in local development databases; production never stored one.
export const LEGACY_PBKDF2_ITERATIONS = 310_000;

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('');
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join('');
export const safeEqual = (a: string, b: string) => { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; };

async function derive(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations, hash: 'SHA-256' }, key, 256));
}

/** Stored format: `salt:iterations:hash`. */
export const passwordHash = async (password: string, salt = randomToken()): Promise<string> => `${salt}:${PBKDF2_ITERATIONS}:${await derive(password, salt, PBKDF2_ITERATIONS)}`;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  const [salt, iterations, expected] = parts.length === 3 ? [parts[0], Number(parts[1]), parts[2]] : parts.length === 2 ? [parts[0], LEGACY_PBKDF2_ITERATIONS, parts[1]] : ['', 0, ''];
  if (!salt || !expected || !Number.isSafeInteger(iterations) || iterations < 1) return false;
  return safeEqual(await derive(password, salt, iterations), expected);
}

// A fixed non-account hash keeps unknown-account verification to one derivation.
export const DUMMY_PASSWORD_HASH = `${"0".repeat(64)}:${PBKDF2_ITERATIONS}:${"0".repeat(64)}`;
