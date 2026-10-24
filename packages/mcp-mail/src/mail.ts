import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ImapFlow, type SearchObject } from 'imapflow';
import { dataPaths } from '@sloth/shared';

/**
 * Read-only email sync (IMAP). Only messages that look like money admin (trials, subscriptions,
 * receipts, orders, returns, warranties) are copied into the inbox as .eml files; everything
 * else stays on the mail server. The password lives in the macOS Keychain, never in a file.
 */

export interface MailAccount { user: string; host: string; port: number; days: number; last_sync?: string; fetched_total?: number }
export const KEYWORDS = ['trial', 'subscription', 'renew', 'renewal', 'receipt', 'invoice', 'order', 'return', 'refund', 'warranty', 'membership', 'billing', 'payment', 'cancel'];
const SERVICE = 'refund-sloth-imap';

export const providerHost = (email: string): string => {
  const d = email.split('@')[1]?.toLowerCase() ?? '';
  if (d === 'gmail.com' || d === 'googlemail.com') return 'imap.gmail.com';
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(d)) return 'outlook.office365.com';
  if (d === 'yahoo.com') return 'imap.mail.yahoo.com';
  if (['icloud.com', 'me.com', 'mac.com'].includes(d)) return 'imap.mail.me.com';
  return `imap.${d}`;
};

/** Gmail gets one server-side X-GM-RAW query; other providers get a SINCE + OR(subject…) search. */
export function buildSearch(host: string, days: number, now = new Date()): SearchObject {
  if (host === 'imap.gmail.com') {
    return { gmailraw: `newer_than:${days}d -category:social (${KEYWORDS.map((k) => `subject:${k}`).join(' OR ')} OR "free trial")` };
  }
  return { since: new Date(now.getTime() - days * 86400000), or: KEYWORDS.map((k) => ({ subject: k })) };
}

/** Stable, de-duplicating file name for a fetched message. */
export const emlName = (messageId: string, date: Date | undefined) =>
  `mail_${(date ?? new Date()).toISOString().slice(0, 10)}_${crypto.createHash('sha1').update(messageId).digest('hex').slice(0, 10)}.eml`;

export function loadAccount(): MailAccount | null {
  const p = dataPaths().mail;
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as MailAccount) : null;
}
export function saveAccount(a: MailAccount) {
  fs.mkdirSync(path.dirname(dataPaths().mail), { recursive: true });
  fs.writeFileSync(dataPaths().mail, JSON.stringify(a, null, 2), { mode: 0o600 });
}

// ---- Keychain (macOS). Other OSes: set SLOTH_IMAP_PASSWORD. ----
const mac = process.platform === 'darwin';
export function getPassword(user: string): string | null {
  if (process.env.SLOTH_IMAP_PASSWORD) return process.env.SLOTH_IMAP_PASSWORD;
  if (!mac) return null;
  try { return execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', user, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}
export function setPassword(user: string, password: string) {
  if (!mac) throw new Error('Keychain is macOS-only. On other systems set SLOTH_IMAP_PASSWORD instead.');
  const q = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;
  // `security -i` reads the command from stdin, so the password never appears in the process list.
  execFileSync('security', ['-i'], { input: `add-generic-password -U -s ${q(SERVICE)} -a ${q(user)} -w ${q(password)}\n`, stdio: ['pipe', 'ignore', 'ignore'] });
  if (getPassword(user) !== password) throw new Error('Could not save the password to the Keychain');
}
export function deletePassword(user: string) {
  if (!mac) return;
  try { execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', user], { stdio: 'ignore' }); } catch { /* not there */ }
}

const client = (a: Pick<MailAccount, 'user' | 'host' | 'port'>, pass: string) =>
  new ImapFlow({ host: a.host, port: a.port, secure: true, auth: { user: a.user, pass }, logger: false, connectionTimeout: 20000 });

/** Log in and out once, to check the address + app password before saving them. */
export async function testLogin(a: Pick<MailAccount, 'user' | 'host' | 'port'>, pass: string) {
  const c = client(a, pass);
  try { await c.connect(); } catch (e) {
    const msg = (e as { authenticationFailed?: boolean }).authenticationFailed ? 'Login failed: check the email and app password' : (e as Error).message;
    throw new Error(msg);
  }
  await c.logout();
}

export interface SyncResult { matched: number; fetched: number; skipped: number; files: string[] }

/** Copy matching messages from INBOX (opened read-only, nothing is marked as read) into the Refund Sloth inbox. */
export async function syncMail(opts: { days?: number; max?: number } = {}): Promise<SyncResult> {
  const a = loadAccount();
  if (!a) throw new Error('No mail account connected. Run `sloth mail connect` or use the dashboard.');
  const pass = getPassword(a.user);
  if (!pass) throw new Error(`No password in the Keychain for ${a.user}. Connect again.`);
  const days = opts.days ?? a.days, max = opts.max ?? 200;
  const inbox = dataPaths().inbox;
  fs.mkdirSync(inbox, { recursive: true });
  const c = client(a, pass);
  await c.connect();
  const out: SyncResult = { matched: 0, fetched: 0, skipped: 0, files: [] };
  const lock = await c.getMailboxLock('INBOX', { readOnly: true });
  try {
    const uids = (await c.search(buildSearch(a.host, days), { uid: true })) || [];
    out.matched = uids.length;
    const recent = uids.sort((x, y) => y - x).slice(0, max);
    if (recent.length) {
      for await (const m of c.fetch(recent, { uid: true, envelope: true, source: true }, { uid: true })) {
        const name = emlName(m.envelope?.messageId ?? `${a.user}:${m.uid}`, m.envelope?.date);
        const file = path.join(inbox, name);
        if (fs.existsSync(file) || !m.source) { out.skipped++; continue; }
        fs.writeFileSync(file, m.source, { mode: 0o600 });
        out.fetched++; out.files.push(name);
      }
    }
  } finally {
    lock.release();
    await c.logout().catch(() => {});
  }
  saveAccount({ ...a, last_sync: new Date().toISOString(), fetched_total: (a.fetched_total ?? 0) + out.fetched });
  return out;
}
