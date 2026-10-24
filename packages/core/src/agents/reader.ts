import path from 'node:path';
import { ExtractionResult, type ExtractedItem } from '@sloth/shared';
import { modelFor } from '@sloth/shared';
import { bus, log } from '../events.ts';
import { prompt } from '../prompts.ts';
import type { SlothContext } from '../context.ts';
import type { ScoutedFile } from './scout.ts';

export interface SavedItem { item_id: string; item: ExtractedItem; needs_review: boolean; file: string }
interface Email { from: string; to: string; subject: string; date: string | null; text: string }

const PURCHASE_HINT = /order|receipt|invoice|trial|subscription|renew|warranty|purchase|confirm|billing|payment/i;
const MAX_CHARS = 12000;

async function extract(ctx: SlothContext, input: { text?: string; image?: string }) {
  const model = modelFor(ctx.cfg, input.image ? 'reader_vision' : 'reader_text');
  return ctx.llm.chatJSON(ExtractionResult, {
    model, agent: 'reader', system: prompt('reader'),
    user: input.image ? 'Extract the purchase facts from this receipt image.' : `Extract purchase facts from this document:\n\n${input.text!.slice(0, MAX_CHARS)}`,
    images: input.image ? [input.image] : undefined,
  });
}

const emailText = (e: Email) => `From: ${e.from}\nDate: ${e.date ?? 'unknown'}\nSubject: ${e.subject}\n\n${e.text}`;

function clean(item: ExtractedItem, fallbackDate: string | null): { item: ExtractedItem; needs_review: boolean } {
  const shouting = item.merchant.length > 4 && item.merchant === item.merchant.toUpperCase() && /[A-Z]/.test(item.merchant);
  const merchant = shouting ? item.merchant.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : item.merchant;
  const it = { ...item, merchant, currency: item.currency ? item.currency.toUpperCase() : 'USD' };
  let needs = it.confidence < 0.6;
  if (!it.purchase_date && fallbackDate) { it.purchase_date = fallbackDate; it.confidence = Math.min(it.confidence, 0.7); }
  if (!it.purchase_date || it.amount === null) needs = true;
  return { item: it, needs_review: needs };
}

/** Reader: turns one file into validated, saved items. Throws on unrecoverable parse errors (caller marks file failed). */
export async function read(ctx: SlothContext, file: ScoutedFile): Promise<SavedItem[]> {
  const name = path.basename(file.path);
  const docs: { text?: string; image?: string; date: string | null; label: string }[] = [];

  if (file.kind === 'receipt_image') {
    const img = await ctx.hub.call<{ base64_jpeg: string }>('docs_read_image', { path: file.path });
    docs.push({ image: img.base64_jpeg, date: null, label: name });
  } else if (file.kind === 'invoice_pdf') {
    const pdf = await ctx.hub.call<{ text: string; scanned: boolean }>('docs_read_pdf', { path: file.path });
    if (pdf.scanned) throw new Error('scanned PDF with no text layer - export it as an image (PNG/JPG) instead');
    docs.push({ text: pdf.text, date: null, label: name });
  } else if (file.kind === 'email') {
    const e = await ctx.hub.call<Email>('docs_read_email', { path: file.path });
    docs.push({ text: emailText(e), date: e.date, label: e.subject || name });
  } else if (file.kind === 'mbox') {
    const msgs = await ctx.hub.call<(Email & { index: number })[]>('docs_split_mbox', { path: file.path });
    const relevant = msgs.filter((m) => PURCHASE_HINT.test(`${m.subject}\n${m.text}`));
    log('reader', `${name}: ${msgs.length} messages, ${relevant.length} look like purchases (skipping ${msgs.length - relevant.length} newsletters)`);
    for (const m of relevant) docs.push({ text: emailText(m), date: m.date, label: m.subject });
  } else {
    return [];
  }

  const saved: SavedItem[] = [];
  for (const d of docs) {
    const res = await extract(ctx, d);
    if (!res.ok) {
      log('reader', `⚠️ could not extract "${d.label}" (${res.error.slice(0, 80)})`);
      continue;
    }
    if (!res.data.items.length) { log('reader', `${d.label} → nothing to track`); continue; }
    for (const raw of res.data.items) {
      const { item, needs_review } = clean(raw, d.date);
      const r = await ctx.hub.call<{ item_id: string; duplicate: boolean }>('ledger_save_item', { file_id: file.file_id, item, needs_review });
      if (r.duplicate) { log('reader', `${item.merchant} order ${item.order_number} already known - skipping`); continue; }
      saved.push({ item_id: r.item_id, item, needs_review, file: name });
      const money = item.amount !== null ? `$${item.amount.toFixed(2)}` : '$?';
      log('reader', `${d.label.slice(0, 40)} → ${item.merchant} · ${item.item_name ?? item.kind} · ${money} (${item.confidence.toFixed(2)})${needs_review ? ' 👀 needs a look' : ''}`,
        { item_id: r.item_id, merchant: item.merchant });
    }
  }
  bus.emitEvent({ type: 'file.processed', agent: 'reader', message: `${name}: ${saved.length} item(s)`, data: { file: name, items: saved.length } });
  return saved;
}
