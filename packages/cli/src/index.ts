#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { Command } from 'commander';
import pc from 'picocolors';
import Table from 'cli-table3';
import { REPO_ROOT, dataPaths, loadConfig, today, daysUntil, type SlothConfig } from '@sloth/shared';
import { Ledger } from '@sloth/mcp-ledger';
import { deletePassword, getPassword, loadAccount, providerHost, saveAccount, secretStoreName, setPassword, syncMail, testLogin } from '@sloth/mcp-mail';
import {
  bus, createContext, ensureDataDirs, installSchedule, LLM, McpHub, runNight, startCron, startServer, uninstallSchedule, type SlothEvent,
} from '@sloth/core';

const EMOJI: Record<string, string> = { boss: '🦥', scout: '🔭', reader: '📖', hawk: '🦅', auditor: '🧾', ghost: '👻', system: '⚙️ ' };
const NAME: Record<string, string> = { boss: 'Boss', scout: 'Scout', reader: 'Reader', hawk: 'Hawk', auditor: 'Auditor', ghost: 'Ghost', system: 'System' };

function prettyEvent(e: SlothEvent) {
  if (e.type === 'llm.call' && !process.env.SLOTH_VERBOSE) return;
  const t = pc.dim(e.ts.slice(11, 19));
  const who = `${EMOJI[e.agent ?? 'system']} ${pc.bold(NAME[e.agent ?? 'system']!.padEnd(7))}`;
  const msg = e.type === 'file.failed' ? pc.red(e.message) : e.type === 'agent.tool' ? pc.cyan(e.message) : e.type === 'run.end' ? pc.green(e.message) : e.message;
  console.log(`${t} ${who} ${msg}`);
}

const money = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `$${Number(n).toFixed(2)}`);
const chip = (due: string) => {
  const d = daysUntil(due);
  const s = d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
  return d <= 3 ? pc.red(s) : d <= 7 ? pc.yellow(s) : pc.green(s);
};

function printBrief(ledger: Ledger) {
  const b = ledger.latestBrief();
  if (!b) { console.log(pc.yellow('No brief yet. Run `sloth run` or `sloth demo` first.')); return; }
  const brief = JSON.parse(b.brief) as { headline: string; second_line: string };
  console.log(`\n${pc.bold(pc.green(brief.headline))}\n${brief.second_line}\n`);
  const s = ledger.stats();
  console.log(`💰 Saved ${money(s.saved_one_time)} + ${money(s.saved_monthly)}/mo   ⚠️  At risk ${money(s.at_risk)}   📬 ${s.pending_actions} drafts   🔎 ${s.needs_review} need a look\n`);
  const urgent = ledger.upcoming(30).slice(0, 5);
  if (urgent.length) {
    const t = new Table({ head: ['Due', 'In', 'Type', 'Merchant', 'At risk', 'Source'] });
    for (const d of urgent) t.push([d.due_date, chip(d.due_date), d.type, d.merchant, money(d.amount_at_risk), d.source === 'llm_guess' ? pc.yellow('AI guess') : d.source]);
    console.log(t.toString());
  }
}

function printQueue(ledger: Ledger) {
  const rows = ledger.actions('pending');
  if (!rows.length) { console.log(pc.green('Queue is empty. Nap away 🦥')); return; }
  const t = new Table({ head: ['ID', 'Type', 'Title', 'Saves', 'Due'], colWidths: [16, 15, 46, 14, 12], wordWrap: true });
  for (const a of rows) t.push([a.id, a.type, a.title, `${money(a.potential_saving)}${a.saving_period === 'monthly' ? '/mo' : ''}`, a.due_date ?? '–']);
  console.log(t.toString());
}

async function doRun(opts: { today?: string; dryRun?: boolean }) {
  if (opts.today) process.env.SLOTH_TODAY = opts.today;
  if (opts.dryRun) process.env.SLOTH_NO_NOTIFY = '1';
  const off = bus.onEvent(prettyEvent);
  const ctx = await createContext();
  try {
    const r = await runNight(ctx);
    console.log(pc.dim(`\nfiles ${r.summary.files} · items ${r.summary.items} · deadlines ${r.summary.deadlines} · subs ${r.summary.subscriptions} · drafts ${r.summary.drafts} · failed ${r.summary.failed} · ${r.secs}s`));
  } finally {
    off();
    await ctx.hub.close();
  }
  const ledger = new Ledger();
  printBrief(ledger);
  ledger.close();
}

function openUrl(url: string) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { const c = spawn(cmd, args as string[], { stdio: 'ignore', detached: true, windowsHide: true }); c.on('error', () => {}); c.unref(); } catch { /* no browser */ }
}

function copyToClipboard(text: string): boolean {
  const tries: [string, string[]][] = process.platform === 'win32' ? [['clip', []]] : process.platform === 'darwin' ? [['pbcopy', []]] : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']]];
  for (const [cmd, args] of tries) { try { execFileSync(cmd, args, { input: text, stdio: ['pipe', 'ignore', 'ignore'] }); return true; } catch { /* try next */ } }
  return false;
}

const program = new Command().name('sloth').description('🦥 Refund Sloth – gets your money back while you nap. 100% local.').version('0.1.0');

program.command('init').description('create ~/RefundSloth and a config, check Ollama').action(async () => {
  const p = ensureDataDirs();
  if (!fs.existsSync(p.config)) {
    const example = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'sloth.config.example.json'), 'utf8')) as SlothConfig;
    let email = example.user.email;
    let name = example.user.name;
    try { email = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim() || email; } catch { /* no git */ }
    try { name = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim() || name; } catch { /* no git */ }
    fs.writeFileSync(p.config, JSON.stringify({ ...example, user: { name, email } }, null, 2));
    console.log(`✅ wrote ${p.config} (edit it to change models, tone, schedule)`);
  } else console.log(`✅ config exists: ${p.config}`);
  console.log(`📥 drop receipts, PDFs, .eml/.mbox and bank CSVs into ${pc.bold(p.inbox)}`);
  const cfg = loadConfig();
  const llm = new LLM(cfg.ollamaHost);
  if (!(await llm.ping())) { console.log(pc.red(`❌ Ollama not reachable at ${cfg.ollamaHost}. Install from https://ollama.com and run \`ollama serve\`.`)); return; }
  const missing = (await llm.modelStatus(Object.values(cfg.profiles[cfg.profile]!))).filter((m) => !m.present);
  if (missing.length) { console.log(pc.yellow('Missing models, run:')); for (const m of missing) console.log(`  ollama pull ${m.name}`); }
  else console.log('✅ all models present. Try: sloth demo');
});

program.command('doctor').description('check Node, Ollama, models, DB, MCP servers, offline-ness').option('--allow-remote', 'allow a non-localhost ollamaHost').action(async (o) => {
  let ok = true;
  const pass = (m: string) => console.log(`${pc.green('✔')} ${m}`);
  const fail = (m: string) => { ok = false; console.log(`${pc.red('✘')} ${m}`); };
  const major = Number(process.versions.node.split('.')[0]);
  (major >= 22 ? pass : fail)(`Node ${process.versions.node} (need ≥ 22 for node:sqlite)`);
  const cfg = loadConfig();
  const host = new URL(cfg.ollamaHost).hostname;
  const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
  (local || o.allowRemote ? pass : fail)(`ollamaHost ${cfg.ollamaHost} ${local ? '(loopback, no internet needed)' : '(REMOTE – data would leave this machine)'}`);
  const llm = new LLM(cfg.ollamaHost);
  if (await llm.ping()) {
    pass('Ollama reachable');
    for (const [role, model] of Object.entries(cfg.profiles[cfg.profile]!)) {
      const [st] = await llm.modelStatus([model]);
      if (!st?.present) fail(`${role}: ${model} not pulled → ollama pull ${model}`);
      else if (role === 'reader_vision' && !st.vision) fail(`${role}: ${model} has no vision capability`);
      else if (role === 'boss' && !st.tools) fail(`${role}: ${model} has no tool-calling capability`);
      else pass(`${role.padEnd(13)} ${model}${st.vision ? ' 👁' : ''}${st.tools ? ' 🛠' : ''}`);
    }
  } else fail(`Ollama not reachable at ${cfg.ollamaHost}`);
  try { ensureDataDirs(); const l = new Ledger(); l.stats(); l.close(); pass(`DB writable: ${dataPaths().db}`); } catch (e) { fail(`DB: ${(e as Error).message}`); }
  try {
    const hub = await new McpHub().start({ filesystem: true });
    for (const [name, tools] of Object.entries(hub.serverSummary())) pass(`MCP ${name.padEnd(10)} ${tools.length} tools`);
    await hub.close();
  } catch (e) { fail(`MCP servers: ${(e as Error).message}`); }
  console.log(ok ? pc.green('\n🦥 all good – the sloth is ready to nap on the job') : pc.red('\nsome checks failed'));
  process.exitCode = ok ? 0 : 1;
});

program.command('run').description('run the nightly pipeline now').option('--dry-run', 'no desktop notifications').option('--today <date>', 'pretend today is YYYY-MM-DD')
  .action(async (o) => { await doRun(o); });

program.command('brief').description('print the latest morning brief').action(() => { const l = new Ledger(); printBrief(l); l.close(); });
program.command('queue').description('list pending actions').action(() => { const l = new Ledger(); printQueue(l); l.close(); });

program.command('approve <id>').description('approve an action (copies the email to the clipboard)').action((id: string) => {
  const l = new Ledger();
  const a = l.actions().find((x) => x.id === id);
  if (!a) { console.log(pc.red(`no action ${id}`)); l.close(); process.exitCode = 1; return; }
  l.decideAction(id, 'approved');
  if (a.type !== 'review') {
    if (copyToClipboard(`Subject: ${a.subject ?? ''}\n\n${a.body}`)) console.log('📋 email copied to clipboard');
    console.log(`✉️  mailto:${a.to_address ?? ''}?subject=${encodeURIComponent(a.subject ?? '')}&body=${encodeURIComponent(a.body)}`);
  }
  console.log(pc.green(`✅ approved – ${a.title}`));
  const s = l.stats();
  console.log(`💰 saved so far: ${money(s.saved_one_time)} + ${money(s.saved_monthly)}/mo`);
  l.close();
});
program.command('dismiss <id>').description('dismiss an action').action((id: string) => { const l = new Ledger(); l.decideAction(id, 'dismissed'); console.log('🗑  dismissed'); l.close(); });
program.command('snooze <id> [days]').description('snooze an action').action((id: string, days?: string) => {
  const l = new Ledger(); l.decideAction(id, 'snoozed', Number(days ?? 3)); console.log(`💤 snoozed ${days ?? 3} days`); l.close();
});

program.command('serve').description('start dashboard + API + nightly scheduler').option('--port <n>', 'port').option('--no-schedule', 'disable cron').option('--no-open', 'do not open browser')
  .action(async (o) => {
    ensureDataDirs();
    const cfg = loadConfig();
    bus.onEvent(prettyEvent);
    const { port } = await startServer(Number(o.port ?? cfg.dashboardPort));
    if (o.schedule) startCron(cfg.schedule);
    const url = `http://127.0.0.1:${port}`;
    console.log(`🦥 dashboard on ${pc.bold(url)}  (Ctrl+C to stop)`);
    if (o.open) openUrl(url);
  });

const schedule = program.command('schedule').description('install/uninstall the nightly job (macOS launchd / Windows Task Scheduler)');
schedule.command('install').action(() => { console.log(`✅ installed ${installSchedule(loadConfig().schedule)} (runs even when the CLI is closed)`); });
schedule.command('uninstall').action(() => { console.log(`🗑  removed ${uninstallSchedule()}`); });

program.command('demo').description('copy fake fixtures into the inbox and run with today = 2026-10-21').option('--serve', 'start the dashboard afterwards')
  .action(async (o) => {
    process.env.SLOTH_TODAY ??= '2026-10-21';
    const p = ensureDataDirs();
    const fx = path.join(REPO_ROOT, 'eval/fixtures');
    const files = fs.readdirSync(fx).filter((f) => !f.startsWith('.'));
    for (const f of files) fs.copyFileSync(path.join(fx, f), path.join(p.inbox, f));
    console.log(`📥 copied ${files.length} fake files into ${p.inbox} · pretending today is ${today()}\n`);
    await doRun({});
    if (o.serve) {
      const { port } = await startServer(loadConfig().dashboardPort);
      bus.onEvent(prettyEvent);
      console.log(`\n🦥 dashboard on http://127.0.0.1:${port}`);
      openUrl(`http://127.0.0.1:${port}`);
    }
  });

program.command('eval').description('measure extraction accuracy on fixtures').action(() => {
  execFileSync(process.execPath, ['--import', import.meta.resolve('tsx/esm'), path.join(REPO_ROOT, 'eval/run-eval.ts')], { stdio: 'inherit', cwd: REPO_ROOT });
});

program.command('reset').description('delete the DB, reminders and reports (never the inbox)').option('--yes', 'confirm').action((o) => {
  if (!o.yes) { console.log('add --yes to confirm (inbox files are kept)'); return; }
  const p = dataPaths();
  for (const f of [p.db, `${p.db}-wal`, `${p.db}-shm`, p.lock]) fs.rmSync(f, { force: true });
  for (const d of [p.reminders, p.reports]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  console.log('🧹 reset done (inbox kept)');
});

/** Ask for a secret without echoing it to the terminal. */
function askHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(q);
    const stdin = process.stdin;
    let buf = '';
    stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return resolve(buf); }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f') buf = buf.slice(0, -1); else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

const mail = program.command('mail').description('connect a mailbox (read-only IMAP) so trial & receipt emails arrive by themselves');
mail.command('connect <email>').description('test the login and save the app password (macOS Keychain / Windows DPAPI)')
  .option('--host <host>', 'IMAP host (auto for Gmail, Outlook, Yahoo, iCloud)').option('--days <n>', 'how far back to look', '60')
  .action(async (email: string, o) => {
    const account = { user: email, host: o.host ?? providerHost(email), port: 993, days: Number(o.days) };
    if (account.host === 'imap.gmail.com') console.log(pc.dim('Gmail needs an App Password (2-Step Verification on → https://myaccount.google.com/apppasswords).'));
    const pass = (process.env.SLOTH_IMAP_PASSWORD ?? await askHidden(`App password for ${email}: `)).replace(/\s+/g, '');
    process.stdout.write(pc.dim(`Testing login to ${account.host}… `));
    await testLogin(account, pass);
    console.log(pc.green('ok'));
    if (!process.env.SLOTH_IMAP_PASSWORD) setPassword(email, pass);
    saveAccount(account);
    console.log(`${pc.green('✔')} Connected. Refund Sloth will read (never send, delete or mark as read) matching emails before each run.`);
    console.log(pc.dim('Try it now: sloth mail sync'));
  });
mail.command('sync').description('fetch matching emails into the inbox now').option('--days <n>', 'look back N days').action(async (o) => {
  const r = await syncMail({ days: o.days ? Number(o.days) : undefined });
  console.log(`${pc.green('✔')} ${r.matched} matching emails · ${pc.bold(String(r.fetched))} new · ${r.skipped} already had`);
  if (r.fetched) console.log(pc.dim('Run `sloth run` to process them (or wait for tonight).'));
});
mail.command('status').description('show the connected mailbox').action(() => {
  const a = loadAccount();
  if (!a) return console.log(pc.yellow('No mailbox connected. Run: sloth mail connect you@gmail.com'));
  console.log(`📬 ${pc.bold(a.user)} via ${a.host} · last ${a.days} days · last sync ${a.last_sync ?? 'never'} · ${a.fetched_total ?? 0} emails fetched · password ${getPassword(a.user) ? pc.green(`saved (${secretStoreName})`) : pc.red('missing')}`);
});
mail.command('disconnect').description('forget the mailbox and delete the saved password').action(() => {
  const a = loadAccount();
  if (a) { deletePassword(a.user); fs.rmSync(dataPaths().mail, { force: true }); }
  console.log(`${pc.green('✔')} Disconnected. Emails already copied stay in the inbox.`);
});

program.parseAsync().catch((e) => { console.error(pc.red(`✘ ${(e as Error).message}`)); process.exit(1); });
