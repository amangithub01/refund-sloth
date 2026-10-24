import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { Ledger } from '@sloth/mcp-ledger';
import { REPO_ROOT, dataDir, dataPaths, linksFor, loadConfig, loadPolicies, today, ExtractedItem, type SlothConfig } from '@sloth/shared';
import { deletePassword, getPassword, loadAccount, providerHost, saveAccount, setPassword, syncMail, testLogin } from '@sloth/mcp-mail';
import { z } from 'zod';
import { bus } from './events.ts';
import { LLM } from './llm.ts';
import { createContext } from './context.ts';
import { isRunning, runNight, RunInProgressError } from './pipeline.ts';
import { computeDeadlines } from './agents/deadlineHawk.ts';

const DIST = path.join(REPO_ROOT, 'packages/dashboard/dist');

/** Runs the whole pipeline in-process (spawns MCP servers, then closes them). */
export async function runOnce() {
  const ctx = await createContext();
  try { return await runNight(ctx); } finally { await ctx.hub.close(); }
}

export function createApp(cfg: SlothConfig = loadConfig()) {
  const app = express();
  const ledger = new Ledger();
  const llm = new LLM(cfg.ollamaHost);
  app.use(express.json({ limit: '1mb' }));

  // Only accept requests addressed to localhost (blocks DNS-rebinding from random web pages).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const host = (req.headers.host ?? '').split(':')[0];
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host!)) return res.status(403).json({ error: 'localhost only' });
    next();
  });

  /** Add "Cancel now" / "Start return" links from links.json to anything that has a merchant. */
  const withLinks = <T extends { merchant?: string | null }>(rows: T[]) => rows.map((r) => ({ ...r, links: r.merchant ? linksFor(r.merchant) : {} }));

  const models = () => [...new Set(Object.values(cfg.profiles[cfg.profile]!))];

  app.get('/api/health', async (_req, res) => {
    const ollama = await llm.ping();
    const status = ollama ? await llm.modelStatus(models()).catch(() => []) : models().map((name) => ({ name, present: false, tools: false, vision: false }));
    res.json({ ollama, models: status, profile: cfg.profile, dataDir: dataDir(), running: isRunning(), today: today() });
  });
  app.get('/api/stats', (_req, res) => res.json({ ...ledger.stats(), timeline: ledger.savingsTimeline(), today: today(), urgent_days: cfg.urgentDays }));
  app.get('/api/deadlines', (req, res) => {
    const days = req.query.days ? Number(req.query.days) : undefined;
    res.json(withLinks(ledger.deadlines({ status: (req.query.status as string) || undefined, days })));
  });
  app.patch('/api/deadlines/:id', (req, res) => {
    const s = z.object({ status: z.enum(['open', 'done', 'dismissed']) }).parse(req.body);
    res.json(ledger.setDeadlineStatus(req.params.id, s.status));
  });
  app.get('/api/subscriptions', (_req, res) => res.json(withLinks(ledger.subscriptions())));
  app.patch('/api/subscriptions/:id', (req, res) => {
    const b = z.object({ status: z.enum(['active', 'cancelled', 'keep']).optional(), unused: z.boolean().optional() }).parse(req.body);
    res.json(ledger.updateSubscription(req.params.id, b));
  });
  app.get('/api/actions', (req, res) => res.json(withLinks(ledger.actions((req.query.status as string) || undefined))));

  // ---- Mailbox (read-only IMAP). The app password goes straight to the macOS Keychain. ----
  const mailStatus = () => {
    const a = loadAccount();
    return a ? { connected: true, user: a.user, host: a.host, days: a.days, last_sync: a.last_sync ?? null, fetched_total: a.fetched_total ?? 0, has_password: !!getPassword(a.user) } : { connected: false };
  };
  app.get('/api/mail', (_req, res) => res.json(mailStatus()));
  app.post('/api/mail/connect', async (req, res, next) => {
    try {
      const b = z.object({ email: z.string().email(), app_password: z.string().min(4), host: z.string().optional(), days: z.number().int().min(1).max(365).optional() }).parse(req.body);
      const account = { user: b.email.trim(), host: b.host || providerHost(b.email), port: 993, days: b.days ?? 60 };
      const pass = b.app_password.replace(/\s+/g, '');
      try { await testLogin(account, pass); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
      setPassword(account.user, pass);
      saveAccount(account);
      res.json(mailStatus());
    } catch (e) { next(e); }
  });
  app.post('/api/mail/sync', async (_req, res) => {
    try { res.json({ ...(await syncMail()), status: mailStatus() }); } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  app.delete('/api/mail', (_req, res) => {
    const a = loadAccount();
    if (a) { deletePassword(a.user); fs.rmSync(dataPaths().mail, { force: true }); }
    res.json({ connected: false });
  });
  app.patch('/api/actions/:id', (req, res) => {
    const b = z.object({ subject: z.string().optional(), body: z.string().optional(), to_address: z.string().nullable().optional() }).parse(req.body);
    res.json(ledger.updateActionDraft(req.params.id, b));
  });
  app.post('/api/actions/:id/decision', (req, res) => {
    const b = z.object({ decision: z.enum(['approved', 'snoozed', 'dismissed']), snooze_days: z.number().int().min(1).max(60).optional() }).parse(req.body);
    const r = ledger.decideAction(req.params.id, b.decision, b.snooze_days);
    bus.emitEvent({ type: 'action.queued', agent: 'system', message: `action ${req.params.id} ${b.decision}` });
    res.json(r);
  });
  app.get('/api/items', (req, res) => res.json(ledger.list('items', { needs_review: req.query.needs_review === '1' || undefined, limit: 200 })));
  app.patch('/api/items/:id', (req, res) => {
    const b = z.object({
      merchant: z.string().min(1).optional(), item_name: z.string().nullable().optional(), amount: z.number().nullable().optional(),
      purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), order_number: z.string().nullable().optional(),
      kind: ExtractedItem.shape.kind.optional(),
    }).parse(req.body);
    const row = ledger.getItem(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    ledger.updateItem(row.id, b);
    const item = ExtractedItem.parse({ ...JSON.parse(row.raw_json), ...b });
    const deadlines = computeDeadlines(item, loadPolicies());
    for (const d of deadlines) ledger.addDeadline({ item_id: row.id, ...d });
    res.json({ ok: true, deadlines });
  });
  app.post('/api/run', (_req, res) => {
    if (isRunning()) return res.status(409).json({ error: 'already running' });
    let sent = false;
    const off = bus.onEvent((e) => {
      if (e.type === 'run.start' && !sent) { sent = true; off(); res.json({ run_id: e.data?.run_id }); }
    });
    runOnce().catch((e) => {
      off();
      if (!sent) { sent = true; res.status(e instanceof RunInProgressError ? 409 : 500).json({ error: (e as Error).message }); }
    });
  });
  app.get('/api/runs', (req, res) => res.json(ledger.runs(Number(req.query.limit ?? 10))));
  app.get('/api/brief/latest', (_req, res) => {
    const b = ledger.latestBrief();
    res.json(b ? { ...JSON.parse(b.brief), finished_at: b.finished_at } : null);
  });
  app.get('/api/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    for (const e of bus.recent(100)) res.write(`data: ${JSON.stringify(e)}\n\n`);
    const off = bus.onEvent((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { off(); clearInterval(ping); });
  });
  app.get('/api/reminders/:file', (req, res) => {
    const did = req.params.file.replace(/\.ics$/, '');
    const d = ledger.deadlines().find((x) => x.id === did);
    const reminders = path.resolve(dataPaths().reminders);
    if (!d?.ics_path || !path.resolve(d.ics_path).startsWith(reminders + path.sep) || !fs.existsSync(d.ics_path)) return res.status(404).end();
    res.download(d.ics_path, `${did}.ics`);
  });

  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.type('text').send('Dashboard not built yet. Run: npm run build'));
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err instanceof z.ZodError ? 400 : 500).json({ error: err.message });
  });
  return { app, ledger };
}

export function startServer(port = loadConfig().dashboardPort) {
  const { app, ledger } = createApp();
  return new Promise<{ close: () => void; port: number }>((resolve) => {
    const srv = app.listen(port, '127.0.0.1', () => resolve({ port, close: () => { srv.close(); ledger.close(); } }));
  });
}
