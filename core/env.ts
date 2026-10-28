import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from './paths';
import { defaultProtector, isProtected, keyFileProtector, unprotectAll } from './secrets';

/**
 * Credentials (e-mail, password, AWS keys) live in the file ".env" in the project folder - NOT in the Input workbook.
 * ".env" is never committed (see .gitignore); ".env.example" shows the names to fill in.
 *
 * Format: one NAME=value per line, # starts a comment, quotes around the value are removed.
 * A name that is ALREADY set as a real environment variable is not overwritten (so a build server can set them its own way).
 */
export const DOTENV_FILE = path.resolve(ROOT, process.env.DOTENV_FILE || '.env');

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, ''); // a trailing comment on an unquoted value
    out[m[1]] = v;
  }
  return out;
}

/** The names whose values are protected (everything credential-like; AWS_REGION and other plain settings stay readable). */
const PROTECT_NAME = /(EMAIL|PASSWORD|SECRET|TOKEN|ACCESS_KEY)/i;
export function isProtectedName(name: string): boolean {
  return PROTECT_NAME.test(name) && (name in CREDENTIALS || Object.values(CREDENTIALS).some((a) => a.includes(name)));
}

const LINE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;
const plainValue = (raw: string): string => {
  const v = raw.trim();
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1);
  return v.replace(/\s+#.*$/, '');
};

/**
 * Replaces every plain credential value in the file by its protected text (see core/secrets.ts). Returns the NAMES that were protected.
 * Each value is decrypted again and compared before the file is written; on any difference or error the file is left as it is.
 */
export function protectDotEnv(file: string = DOTENV_FILE): string[] {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const todo: Array<{ i: number; name: string; value: string; head: string }> = [];
  lines.forEach((l, i) => {
    const m = LINE.exec(l);
    if (!m || !isProtectedName(m[2])) return;
    const value = plainValue(m[4]);
    if (value === '' || isProtected(value)) return;
    todo.push({ i, name: m[2], value, head: m[1] + m[2] + m[3] });
  });
  if (!todo.length) return [];
  let protector = defaultProtector();
  let cipher: string[];
  let back: string[];
  try {
    cipher = protector.protect(todo.map((t) => t.value));
    back = protector.unprotect(cipher);
  } catch (e) {
    if (protector !== keyFileProtector && protector.name === 'Windows DPAPI') {
      console.log(`.env: Windows encryption is not available (${(e as Error).message.split('\n')[0]}); using the key file instead.`);
      protector = keyFileProtector;
      cipher = protector.protect(todo.map((t) => t.value));
      back = protector.unprotect(cipher);
    } else throw e;
  }
  if (back.length !== todo.length || back.some((b, n) => b !== todo[n].value)) {
    throw new Error('.env: the values could not be encrypted safely (the check after encrypting did not give the original). The file was NOT changed.');
  }
  todo.forEach((t, n) => (lines[t.i] = t.head + cipher[n]));
  fs.writeFileSync(file, lines.join(eol));
  return todo.map((t) => t.name);
}

/**
 * Reads .env into process.env (existing variables win): plain values are first protected in the file (see protectDotEnv), then protected
 * values are decrypted in memory. Returns the names that were read - never the values.
 * Throws a message that starts with ".env" when a value cannot be decrypted (for example the file came from another PC).
 */
export function loadDotEnv(file: string = DOTENV_FILE): string[] {
  if (!fs.existsSync(file)) return [];
  protectDotEnv(file);
  const vars = parseDotEnv(fs.readFileSync(file, 'utf8'));
  const names = Object.keys(vars);
  const encrypted = names.filter((k) => isProtected(vars[k]));
  if (encrypted.length) {
    let plain: string[];
    try {
      plain = unprotectAll(encrypted.map((k) => vars[k]));
    } catch (e) {
      throw new Error(`.env: ${(e as Error).message} Affected: ${encrypted.join(', ')}. Type the plain values into .env again; they are encrypted on the next start.`);
    }
    encrypted.forEach((k, n) => (vars[k] = plain[n]));
  }
  for (const k of names) if (process.env[k] === undefined || process.env[k] === '') process.env[k] = vars[k];
  return names;
}

/**
 * The credential names the script reads from .env / the environment. The left name is the one the script uses; the names on the right
 * are alternative spellings that are accepted too (the same names the Phase 1 project uses), so an existing .env can be reused.
 */
export const CREDENTIALS: Record<string, string[]> = {
  QA_EMAIL: ['TESTABLE_EMAIL'],
  QA_PASSWORD: ['TESTABLE_PASSWORD'],
  DEV_EMAIL: ['TESTABLE_EMAIL_DEV'],
  DEV_PASSWORD: ['TESTABLE_PASSWORD_DEV'],
  AWS_ACCESS_KEY_ID: [],
  AWS_SECRET_ACCESS_KEY: [],
  AWS_SESSION_TOKEN: [],
  AWS_REGION: [],
  GOOGLE_EMAIL: [], GOOGLE_PASSWORD: [],
  MICROSOFT_EMAIL: [], MICROSOFT_PASSWORD: [],
  GITHUB_EMAIL: [], GITHUB_PASSWORD: [],
  SSO_EMAIL: [], SSO_PASSWORD: [],
  OKTA_EMAIL: [], OKTA_PASSWORD: [],
  AZUREAD_EMAIL: [], AZUREAD_PASSWORD: [],
  ONELOGIN_EMAIL: [], ONELOGIN_PASSWORD: [],
  AUTH0_EMAIL: [], AUTH0_PASSWORD: [],
};

/** Credential value from the environment (after .env was loaded): the main name first, then the alternative spellings. */
export function credentialFromEnv(name: string): string | undefined {
  for (const n of [name, ...(CREDENTIALS[name] ?? [])]) {
    const v = process.env[n];
    if (v !== undefined && v.trim() !== '') return v.trim();
  }
  return undefined;
}
