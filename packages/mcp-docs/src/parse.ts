import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { simpleParser } from 'mailparser';
import sharp from 'sharp';
import { extractText, getDocumentProxy } from 'unpdf';
import { format, isValid, parse as parseDate } from 'date-fns';
import { safeResolve, type BankTxn, type FileKind } from '@sloth/shared';

export interface InboxFile { path: string; name: string; sha256: string; size: number; ext: string }

export function scanInbox(inbox: string): InboxFile[] {
  if (!fs.existsSync(inbox)) return [];
  const out: InboxFile[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const buf = fs.readFileSync(full);
        out.push({ path: full, name: path.relative(inbox, full), sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length, ext: path.extname(e.name).toLowerCase() });
      }
    }
  };
  walk(inbox);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const DATE_HDR = /^(date|posted|posting date|transaction date|trans\. date)$/i;
const DESC_HDR = /^(description|merchant|payee|details|name|memo)$/i;
const AMT_HDR = /^(amount|debit|withdrawal|withdrawals|charge)$/i;

export function classify(filePath: string): FileKind {
  const ext = path.extname(filePath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.heic', '.webp'].includes(ext)) return 'receipt_image';
  if (ext === '.pdf') return 'invoice_pdf';
  if (ext === '.eml') return 'email';
  if (ext === '.mbox') return 'mbox';
  if (ext === '.csv') {
    const head = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[0] ?? '';
    const cols = head.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.some((c) => DATE_HDR.test(c)) && cols.some((c) => AMT_HDR.test(c))) return 'bank_csv';
  }
  return 'unknown';
}

export async function readPdf(filePath: string): Promise<{ text: string; pages: number; scanned: boolean }> {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(filePath)));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const t = String(text).trim();
  return t.length < 20 ? { text: '', pages: totalPages, scanned: true } : { text: t, pages: totalPages, scanned: false };
}

export interface ParsedEmail { from: string; to: string; subject: string; date: string | null; text: string }

async function parseEmailSource(src: string | Buffer): Promise<ParsedEmail> {
  const m = await simpleParser(src);
  const html = typeof m.html === 'string' ? m.html : '';
  const text = (m.text ?? html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const addr = (a: unknown): string => (a && typeof a === 'object' && 'text' in a ? String((a as { text: string }).text) : '');
  return { from: addr(m.from), to: addr(m.to), subject: m.subject ?? '', date: m.date ? format(m.date, 'yyyy-MM-dd') : null, text };
}

export const readEmail = (filePath: string) => parseEmailSource(fs.readFileSync(filePath));

export function splitMbox(raw: string): string[] {
  return raw.split(/^From .+\d{4}\s*$/m).map((s) => s.replace(/^\r?\n/, '')).filter((s) => s.trim().length > 0);
}

export async function readMbox(filePath: string): Promise<(ParsedEmail & { index: number })[]> {
  const parts = splitMbox(fs.readFileSync(filePath, 'utf8'));
  return Promise.all(parts.map(async (p, index) => ({ index, ...(await parseEmailSource(p)) })));
}

export async function readImage(filePath: string): Promise<{ base64_jpeg: string; width: number; height: number }> {
  const { data, info } = await sharp(filePath).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  return { base64_jpeg: data.toString('base64'), width: info.width, height: info.height };
}

const DATE_FORMATS = ['yyyy-MM-dd', 'MM/dd/yyyy', 'M/d/yyyy', 'dd/MM/yyyy', 'MM-dd-yyyy', 'yyyy/MM/dd', 'MMM d, yyyy', 'd MMM yyyy'];
export function normalizeDate(s: string): string | null {
  const t = s.trim();
  for (const f of DATE_FORMATS) {
    const d = parseDate(t, f, new Date(2000, 0, 1));
    if (isValid(d) && d.getFullYear() > 1990) return format(d, 'yyyy-MM-dd');
  }
  return null;
}

const toNumber = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).replace(/[$,\s]/g, '');
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[()]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
};

/** Returns spend transactions (debits as positive amounts). Credits/refunds are ignored. */
export function parseBankCsv(raw: string): BankTxn[] {
  const { data, meta } = Papa.parse<Record<string, string>>(raw.trim(), { header: true, skipEmptyLines: true });
  const fields = (meta.fields ?? []).map((f) => f.trim());
  const find = (re: RegExp) => fields.find((f) => re.test(f));
  const dateCol = find(DATE_HDR); const descCol = find(DESC_HDR); const amtCol = find(AMT_HDR);
  const creditCol = find(/^(credit|deposit|deposits)$/i);
  if (!dateCol || !descCol || !amtCol) throw new Error(`Could not detect CSV columns from headers: ${fields.join(', ')}`);
  const debitStyle = /debit|withdrawal|charge/i.test(amtCol);
  const out: BankTxn[] = [];
  for (const row of data) {
    const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v]));
    const date = normalizeDate(r[dateCol] ?? ''); const amt = toNumber(r[amtCol]);
    if (!date || amt === null || amt === 0) continue;
    if (creditCol && toNumber(r[creditCol])) continue;
    // Signed single "Amount" column: negatives are spend. Debit-style column: positives are spend.
    let spend: number | null = null;
    if (debitStyle) spend = Math.abs(amt);
    else spend = amt < 0 ? -amt : null;
    if (spend === null) continue;
    out.push({ date, description: String(r[descCol] ?? '').trim(), amount: Math.round(spend * 100) / 100 });
  }
  return out;
}

export const readBankCsv = (filePath: string) => ({ transactions: parseBankCsv(fs.readFileSync(filePath, 'utf8')) });
export { safeResolve };
