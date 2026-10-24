/**
 * Eval: runs the full pipeline on eval/fixtures in a throwaway data dir (today = 2026-10-21)
 * and scores it against eval/expected.json. Writes eval/RESULTS.md.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = import.meta.dirname;
const expected = JSON.parse(fs.readFileSync(path.join(HERE, 'expected.json'), 'utf8')) as {
  today: string;
  files: Record<string, { items: { merchant: string; amount: number; purchase_date: string }[]; deadlines: { type: string; due_date: string }[] }>;
  subscriptions: { match: string; flags: string[] }[];
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-eval-'));
process.env.SLOTH_DATA_DIR = tmp;
process.env.SLOTH_TODAY = expected.today;
process.env.SLOTH_NO_NOTIFY = '1';
if (process.argv.includes('--profile')) process.env.SLOTH_PROFILE = process.argv[process.argv.indexOf('--profile') + 1];

const { createContext, runNight, bus } = await import('@sloth/core');
const { Ledger } = await import('@sloth/mcp-ledger');
const { loadConfig } = await import('@sloth/shared');

fs.mkdirSync(path.join(tmp, 'inbox'), { recursive: true });
const fx = path.join(HERE, 'fixtures');
for (const f of fs.readdirSync(fx)) fs.copyFileSync(path.join(fx, f), path.join(tmp, 'inbox', f));

const cfg = loadConfig();
console.log(`🧪 eval · profile "${cfg.profile}" · data dir ${tmp}`);
bus.onEvent((e) => { if (e.type !== 'llm.call') process.stdout.write('.'); });
const ctx = await createContext();
const t0 = Date.now();
const run = await runNight(ctx);
await ctx.hub.close();
const secs = (Date.now() - t0) / 1000;
console.log('\n');

const ledger = new Ledger();
type Row = Record<string, unknown>;
const rows = (sql: string, ...p: string[]) => ledger.db.prepare(sql).all(...p) as Row[];
const norm = (s: string) => s.toLowerCase().replace(/\.com\b/g, '').replace(/\b(store|inc|the)\b/g, '').replace(/[^a-z0-9]/g, '');
const merchantMatch = (got: string, want: string) => { const g = norm(got), w = norm(want); return g.includes(w) || w.includes(g); };
const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

let fieldsOk = 0, fieldsTotal = 0, dlOk = 0, dlTotal = 0, extraItems = 0;
const fileLines: string[] = [];
for (const [file, exp] of Object.entries(expected.files)) {
  const items = rows(`SELECT i.* FROM items i JOIN files f ON f.id = i.file_id WHERE f.path LIKE ?`, `%/${file}`);
  const deadlines = rows(`SELECT d.* FROM deadlines d JOIN items i ON i.id = d.item_id JOIN files f ON f.id = i.file_id WHERE f.path LIKE ?`, `%/${file}`);
  const used = new Set<unknown>();
  let fOk = 0, fTot = 0;
  for (const e of exp.items) {
    const got = items.find((i) => !used.has(i.id) && merchantMatch(String(i.merchant), e.merchant));
    if (got) used.add(got.id);
    const checks = [
      !!got,
      !!got && Math.abs(Number(got.amount) - e.amount) <= 0.01,
      !!got && got.purchase_date === e.purchase_date,
    ];
    fTot += 3; fOk += checks.filter(Boolean).length;
  }
  extraItems += items.length - used.size;
  let dOk = 0;
  for (const e of exp.deadlines) if (deadlines.some((d) => d.type === e.type && dayDiff(String(d.due_date), e.due_date) <= 1)) dOk++;
  fieldsOk += fOk; fieldsTotal += fTot; dlOk += dOk; dlTotal += exp.deadlines.length;
  const extra = items.length - used.size;
  fileLines.push(`| ${file} | ${fTot ? `${fOk}/${fTot}` : (items.length ? '❌ false positive' : '✅ ignored')} | ${exp.deadlines.length ? `${dOk}/${exp.deadlines.length}` : '–'} | ${extra > 0 ? extra : ''} |`);
}

const subs = ledger.subscriptions();
let subFound = 0, flagOk = 0;
const subLines: string[] = [];
for (const e of expected.subscriptions) {
  const got = subs.find((s) => `${s.normalized_name} ${s.merchant}`.toLowerCase().includes(e.match));
  if (got) subFound++;
  const ok = !!got && [...got.flags].sort().join(',') === [...e.flags].sort().join(',');
  if (ok) flagOk++;
  subLines.push(`| ${e.match} | ${got ? `${got.merchant} ($${got.monthly_cost}/mo)` : '❌ missed'} | ${e.flags.join(', ') || '–'} | ${got?.flags.join(', ') || '–'} | ${ok ? '✅' : '❌'} |`);
}
const falseSubs = subs.filter((s) => !expected.subscriptions.some((e) => `${s.normalized_name} ${s.merchant}`.toLowerCase().includes(e.match)));

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const nFiles = Object.keys(expected.files).length + 1;
const actions = ledger.actions('pending');
const md = `# 🧪 Refund Sloth eval results

- **Date:** ${new Date().toISOString().slice(0, 10)} · pretend-today ${expected.today}
- **Profile:** \`${cfg.profile}\` → ${Object.entries(cfg.profiles[cfg.profile]!).map(([k, v]) => `${k}=\`${v}\``).join(', ')}
- **Hardware:** ${os.cpus()[0]?.model ?? 'unknown'}, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM · Ollama local, no network calls

| Metric | Score |
|---|---|
| Field accuracy (merchant / amount / purchase date) | **${pct(fieldsOk, fieldsTotal)}** (${fieldsOk}/${fieldsTotal}) |
| Deadline accuracy (type + date ±1 day) | **${pct(dlOk, dlTotal)}** (${dlOk}/${dlTotal}) |
| Subscription recall | **${pct(subFound, expected.subscriptions.length)}** (${subFound}/${expected.subscriptions.length}) |
| Subscription flag accuracy | **${pct(flagOk, expected.subscriptions.length)}** (${flagOk}/${expected.subscriptions.length}) |
| False-positive subscriptions | ${falseSubs.length}${falseSubs.length ? ` (${falseSubs.map((s) => s.merchant).join(', ')})` : ''} |
| Extra/unexpected items | ${extraItems} |
| Drafts queued | ${actions.length} |
| Total run time | ${secs.toFixed(0)} s (${(secs / nFiles).toFixed(1)} s/file) |
| Failed files | ${run.summary.failed} |

## Per file
| File | Fields | Deadlines | Extra items |
|---|---|---|---|
${fileLines.join('\n')}

## Subscriptions
| Expected | Found | Expected flags | Got flags | |
|---|---|---|---|---|
${subLines.join('\n')}

## Morning brief produced
> ${run.brief.headline}
> ${run.brief.second_line}
`;
fs.writeFileSync(path.join(HERE, 'RESULTS.md'), md);
ledger.close();
console.log(md);
fs.rmSync(tmp, { recursive: true, force: true });
