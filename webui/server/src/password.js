import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384;
const KEYLEN = 64;

// Stored format: "<N>$<salt b64>$<hash b64>"
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N });
  return `${N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [n, saltB64, hashB64] = String(stored).split('$');
  const expected = Buffer.from(hashB64 || '', 'base64');
  if (!n || !saltB64 || expected.length === 0) return false;
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n) });
  return crypto.timingSafeEqual(actual, expected);
}

// Verified against when the user doesn't exist, so timing doesn't reveal valid usernames.
export const DUMMY_HASH = await hashPassword('dummy-password-for-timing');
