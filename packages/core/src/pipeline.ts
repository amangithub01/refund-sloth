import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { dataPaths } from '@sloth/shared';
import { bus, log, type SlothEvent } from './events.ts';
import type { SlothContext } from './context.ts';
import { scout } from './agents/scout.ts';
import { read } from './agents/reader.ts';
import { hawk } from './agents/deadlineHawk.ts';
import { audit } from './agents/auditor.ts';
import { ghostwrite } from './agents/ghostwriter.ts';
import { boss } from './agents/boss.ts';

export class RunInProgressError extends Error {}

function acquireLock(): () => void {
  const { lock } = dataPaths();
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    try { if (pid) { process.kill(pid, 0); alive = true; } } catch { alive = false; }
    if (alive) throw new RunInProgressError(`A run is already in progress (pid ${pid})`);
  }
  fs.writeFileSync(lock, String(process.pid));
  return () => { try { fs.rmSync(lock); } catch { /* ignore */ } };
}

let running = false;

/** If a mailbox is connected, pull new money-related emails into the inbox first. Never fatal: offline is fine. */
async function syncMailbox(ctx: SlothContext) {
  if (process.env.SLOTH_NO_MAIL === '1') return;
  try {
    const st = await ctx.hub.call<{ connected: boolean; user?: string }>('mail_status');
    if (!st.connected) return;
    log('scout', `checking ${st.user} for new receipts & trial emails (read-only)…`, undefined, 'agent.tool');
    const r = await ctx.hub.call<{ matched: number; fetched: number }>('mail_sync', {});
    log('scout', `mail: ${r.matched} matching emails, ${r.fetched} new`, r);
  } catch (e) {
    log('scout', `mail sync skipped: ${(e as Error).message}`);
  }
}
export const isRunning = () => running;

/** One nightly run: Scout → Reader → Deadline Hawk / Auditor → Ghostwriter → Sloth Boss. */
export async function runNight(ctx: SlothContext) {
  if (running) throw new RunInProgressError('A run is already in progress');
  const release = acquireLock();
  running = true;
  const run_id = `run_${nanoid(8)}`;
  const events: SlothEvent[] = [];
  const off = bus.onEvent((e) => events.push(e));
  const t0 = Date.now();
  const summary = { files: 0, items: 0, deadlines: 0, subscriptions: 0, drafts: 0, failed: 0 };
  try {
    bus.emitEvent({ type: 'run.start', agent: 'boss', message: 'waking up the team… 🦥', data: { run_id } });
    await ctx.hub.call('ledger_record_run', { run_id, status: 'running' });
    await syncMailbox(ctx);
    const files = await scout(ctx);
    summary.files = files.length;

    for (const f of files.filter((f) => f.kind !== 'bank_csv')) {
      try {
        const items = await read(ctx, f);
        summary.items += items.length;
        for (const it of items) summary.deadlines += await hawk(ctx, it);
        await ctx.hub.call('ledger_mark_file', { file_id: f.file_id, status: 'processed' });
      } catch (e) {
        summary.failed++;
        await ctx.hub.call('ledger_mark_file', { file_id: f.file_id, status: 'failed', error: (e as Error).message });
        bus.emitEvent({ type: 'file.failed', agent: 'reader', message: `❌ ${f.name}: ${(e as Error).message}` });
      }
    }
    for (const f of files.filter((f) => f.kind === 'bank_csv')) {
      try {
        summary.subscriptions += await audit(ctx, f);
        await ctx.hub.call('ledger_mark_file', { file_id: f.file_id, status: 'processed' });
      } catch (e) {
        summary.failed++;
        await ctx.hub.call('ledger_mark_file', { file_id: f.file_id, status: 'failed', error: (e as Error).message });
        bus.emitEvent({ type: 'file.failed', agent: 'auditor', message: `❌ ${f.name}: ${(e as Error).message}` });
      }
    }
    summary.drafts = await ghostwrite(ctx);
    const brief = await boss(ctx, summary);
    const secs = Math.round((Date.now() - t0) / 1000);
    off();
    await ctx.hub.call('ledger_record_run', {
      run_id, status: 'done', files_processed: summary.files, brief: JSON.stringify(brief),
      log_json: JSON.stringify(events.map((e) => ({ ts: e.ts, agent: e.agent, type: e.type, message: e.message }))),
    });
    bus.emitEvent({ type: 'run.end', agent: 'boss', message: `done in ${secs}s – ${brief.headline}`, data: { run_id, summary, brief, secs } });
    return { run_id, summary, brief, secs };
  } catch (e) {
    off();
    await ctx.hub.call('ledger_record_run', { run_id, status: 'failed', log_json: JSON.stringify({ error: (e as Error).message }) }).catch(() => {});
    log('boss', `run failed: ${(e as Error).message}`, undefined, 'run.end');
    throw e;
  } finally {
    running = false;
    release();
  }
}
