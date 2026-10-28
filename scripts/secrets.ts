/**
 * Credentials in .env are encrypted automatically (see core/secrets.ts).
 *
 *   npm run secrets:encrypt   encrypts every plain credential value in .env now (it also happens at the start of every run)
 *   npm run secrets:watch     keeps running: the moment you SAVE .env with a plain value, it is encrypted (Ctrl+C to stop)
 *   npm run secrets:check     tells which names in .env can be decrypted on this PC (names only, never values)
 *
 * Type a new value in plain text into .env, save: it turns into dpapi:... (Windows) or enc1:... by itself.
 */
import * as fs from 'fs';
import { DOTENV_FILE, isProtectedName, parseDotEnv, protectDotEnv } from '../core/env';
import { defaultProtector, isProtected, unprotectAll } from '../core/secrets';

function encryptNow(quiet = false): number {
  try {
    const names = protectDotEnv();
    if (names.length) console.log(`Encrypted in .env (${defaultProtector().name}): ${names.join(', ')}`);
    else if (!quiet) console.log('Nothing to encrypt: every credential in .env is already encrypted (or empty).');
    return 0;
  } catch (e) {
    console.error(`✘ ${(e as Error).message}`);
    return 1;
  }
}

function check(): number {
  if (!fs.existsSync(DOTENV_FILE)) { console.error(`No .env file at ${DOTENV_FILE}. Copy .env.example to .env first.`); return 2; }
  const vars = parseDotEnv(fs.readFileSync(DOTENV_FILE, 'utf8'));
  let bad = 0;
  for (const [k, v] of Object.entries(vars)) {
    if (!isProtectedName(k)) continue;
    if (v === '') { console.log(`  - ${k}: empty`); continue; }
    if (!isProtected(v)) { console.log(`  ⚠ ${k}: still plain text (it is encrypted at the next start, or run npm run secrets:encrypt)`); continue; }
    try { unprotectAll([v]); console.log(`  ✔ ${k}: encrypted, can be read on this PC`); } catch { bad++; console.log(`  ✘ ${k}: encrypted, but it CANNOT be read here (made on another PC or by another Windows user) - type it again in plain text`); }
  }
  return bad ? 1 : 0;
}

function watch(): never {
  if (!fs.existsSync(DOTENV_FILE)) { console.error(`No .env file at ${DOTENV_FILE}. Copy .env.example to .env first.`); process.exit(2); }
  console.log(`Watching ${DOTENV_FILE}: plain credentials are encrypted as soon as you save. Ctrl+C to stop.`);
  encryptNow(true);
  let timer: NodeJS.Timeout | undefined;
  fs.watchFile(DOTENV_FILE, { interval: 500 }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => encryptNow(true), 400);
  });
  return new Promise<never>(() => undefined) as never;
}

const cmd = process.argv[2] || 'encrypt';
if (cmd === 'encrypt') process.exit(encryptNow());
else if (cmd === 'check') process.exit(check());
else if (cmd === 'watch') watch();
else { console.error('Use: encrypt | check | watch'); process.exit(2); }
