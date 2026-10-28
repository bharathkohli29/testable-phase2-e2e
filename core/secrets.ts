import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * PROTECTING CREDENTIALS IN .env
 *
 * A value that is typed into .env in plain text is turned into an unreadable text the next time the script starts (or at once with
 * `npm run secrets:watch`), and is turned back into the real value in memory, only while the script is using it.
 *
 *   dpapi:<long hex>   Windows: encrypted with the Windows login of the person who saved it (DPAPI). It can be decrypted only by the
 *                      same Windows user on the same PC. Copying the file somewhere else gives text that cannot be read.
 *   enc1:<base64>      Other systems (and CI): AES-256-GCM with a random key kept in a key file OUTSIDE the project folder
 *                      (~/.testable-e2e/secret.key, or the file named by SECRETS_KEY_FILE).
 *
 * Before a plain value is replaced, it is decrypted again and compared with the original: if that does not give the same text, the
 * file is not touched. A password can therefore never be lost by this step.
 */
export const PREFIX_DPAPI = 'dpapi:';
export const PREFIX_KEY = 'enc1:';

export interface Protector {
  name: string;
  prefix: string;
  protect(values: string[]): string[];
  unprotect(values: string[]): string[];
}

export const isProtected = (v: string): boolean => v.startsWith(PREFIX_DPAPI) || v.startsWith(PREFIX_KEY);

// ────────────────────────────────────────── Windows DPAPI through PowerShell (no extra software needed)
const PS_PROTECT = `$ErrorActionPreference='Stop'
$lines = [Console]::In.ReadToEnd() -split "\\r?\\n" | Where-Object { $_.Trim() -ne '' }
foreach ($l in $lines) {
  $p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($l.Trim()))
  $s = ConvertTo-SecureString -String $p -AsPlainText -Force
  Write-Output (ConvertFrom-SecureString $s)
}`;
const PS_UNPROTECT = `$ErrorActionPreference='Stop'
$lines = [Console]::In.ReadToEnd() -split "\\r?\\n" | Where-Object { $_.Trim() -ne '' }
foreach ($l in $lines) {
  try {
    $s = ConvertTo-SecureString $l.Trim()
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { $p = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
    Write-Output ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p)))
  } catch { Write-Output 'ERR' }
}`;

function powershell(script: string, lines: string[]): string[] {
  const encoded = Buffer.from(script, 'utf16le').toString('base64'); // -EncodedCommand: no quoting problems on the Windows command line
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    input: lines.join('\n') + '\n',
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`Windows PowerShell could not be started: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`Windows PowerShell failed: ${(r.stderr || '').trim().split('\n')[0]}`);
  const out = (r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  if (out.length !== lines.length) throw new Error(`Windows PowerShell returned ${out.length} line(s) for ${lines.length} value(s).`);
  return out;
}

export const dpapiProtector: Protector = {
  name: 'Windows DPAPI',
  prefix: PREFIX_DPAPI,
  protect: (values) => (values.length ? powershell(PS_PROTECT, values.map((v) => Buffer.from(v, 'utf8').toString('base64'))).map((x) => PREFIX_DPAPI + x) : []),
  unprotect: (values) => {
    if (!values.length) return [];
    const out = powershell(PS_UNPROTECT, values.map((v) => v.slice(PREFIX_DPAPI.length)));
    return out.map((o) => {
      if (o === 'ERR') throw new Error('DPAPI could not decrypt a value (it was encrypted by another Windows user or on another PC).');
      return Buffer.from(o, 'base64').toString('utf8');
    });
  },
};

// ────────────────────────────────────────── key file (any system)
function keyFilePath(): string {
  return process.env.SECRETS_KEY_FILE ? path.resolve(process.env.SECRETS_KEY_FILE) : path.join(os.homedir(), '.testable-e2e', 'secret.key');
}
function getKey(create: boolean): Buffer {
  const f = keyFilePath();
  if (fs.existsSync(f)) {
    const k = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64');
    if (k.length !== 32) throw new Error(`The key file ${f} is not a valid 32-byte key.`);
    return k;
  }
  if (!create) throw new Error(`The key file ${f} does not exist, so values encrypted with it cannot be read on this machine.`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const k = crypto.randomBytes(32);
  fs.writeFileSync(f, k.toString('base64'), { mode: 0o600 });
  return k;
}

export const keyFileProtector: Protector = {
  name: 'key file',
  prefix: PREFIX_KEY,
  protect: (values) => {
    if (!values.length) return [];
    const key = getKey(true);
    return values.map((v) => {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(v, 'utf8'), c.final()]);
      return PREFIX_KEY + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
    });
  },
  unprotect: (values) => {
    if (!values.length) return [];
    const key = getKey(false);
    return values.map((v) => {
      try {
        const raw = Buffer.from(v.slice(PREFIX_KEY.length), 'base64');
        const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        d.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
      } catch {
        throw new Error('A value could not be decrypted with the key file of this machine.');
      }
    });
  },
};

let override: Protector | undefined;
/** For the self test only. */
export function setProtectorForTests(p: Protector | undefined): void {
  override = p;
}
/** The protector used for NEW values: DPAPI on Windows, the key file elsewhere (SECRETS_BACKEND=key forces the key file). */
export function defaultProtector(): Protector {
  if (override) return override;
  return process.platform === 'win32' && process.env.SECRETS_BACKEND !== 'key' ? dpapiProtector : keyFileProtector;
}
/** The protector that can read a value, chosen by its prefix. */
export function protectorFor(value: string): Protector {
  if (override && value.startsWith(override.prefix)) return override;
  return value.startsWith(PREFIX_DPAPI) ? dpapiProtector : keyFileProtector;
}

/** Decrypts many values at once (one PowerShell start for all Windows values). Plain values are returned as they are. */
export function unprotectAll(values: string[]): string[] {
  const out = values.slice();
  for (const p of [dpapiProtector, keyFileProtector, ...(override ? [override] : [])]) {
    const idx = values.map((v, i) => (v.startsWith(p.prefix) && protectorFor(v) === p ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const plain = p.unprotect(idx.map((i) => values[i]));
    idx.forEach((i, n) => (out[i] = plain[n]));
  }
  return out;
}

// ────────────────────────────────────────── keeping secrets out of reports
const known = new Set<string>();
/** Registers the real values (passwords, keys, e-mails) so they can be removed from any text that is written to a report. */
export function registerSecretValues(values: string[]): void {
  for (const v of values) if (v && v.trim().length >= 4) known.add(v.trim());
}
export function maskEmail(e: string): string {
  const m = /^([^@\s])([^@\s]*)@(.+)$/.exec(e.trim());
  return m ? `${m[1]}***@${m[3]}` : e;
}
/** Replaces every registered value in `text`: e-mail addresses become b***@domain, everything else ********. */
export function scrub(text: string): string {
  let t = text;
  for (const v of [...known].sort((a, b) => b.length - a.length)) {
    if (!t.includes(v)) continue;
    t = t.split(v).join(v.includes('@') ? maskEmail(v) : '********');
  }
  return t;
}
