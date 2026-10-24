import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import cron from 'node-cron';
import { REPO_ROOT, dataPaths } from '@sloth/shared';
import { log } from './events.ts';
import { isRunning } from './pipeline.ts';
import { runOnce } from './server.ts';

export function startCron(expr: string) {
  if (!cron.validate(expr)) throw new Error(`Invalid cron expression: ${expr}`);
  const task = cron.schedule(expr, async () => {
    if (isRunning()) return;
    log('system', '⏰ scheduled run starting');
    try { await runOnce(); } catch (e) { log('system', `scheduled run failed: ${(e as Error).message}`); }
  });
  log('system', `scheduler armed: "${expr}"`);
  return task;
}

export const PLIST_LABEL = 'dev.refundsloth.nightly';
export const plistPath = () => path.join(os.homedir(), 'Library/LaunchAgents', `${PLIST_LABEL}.plist`);

/** Converts "M H * * *" (daily) cron into launchd StartCalendarInterval; falls back to 02:00. */
function hourMinute(expr: string) {
  const [m, h] = expr.split(/\s+/);
  const mi = Number(m), hr = Number(h);
  return Number.isInteger(mi) && Number.isInteger(hr) ? { Hour: hr, Minute: mi } : { Hour: 2, Minute: 0 };
}

export function buildPlist(expr: string) {
  const { Hour, Minute } = hourMinute(expr);
  const tsxLoader = import.meta.resolve('tsx/esm');
  const cli = path.join(REPO_ROOT, 'packages/cli/src/index.ts');
  const logFile = path.join(dataPaths().root, 'nightly.log');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const args = [process.execPath, '--import', tsxLoader, cli, 'run'].map((a) => `    <string>${esc(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key><string>${esc(REPO_ROOT)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_NO_WARNINGS</key><string>1</string>
    <key>SLOTH_DATA_DIR</key><string>${esc(dataPaths().root)}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${Hour}</integer><key>Minute</key><integer>${Minute}</integer></dict>
  <key>StandardOutPath</key><string>${esc(logFile)}</string>
  <key>StandardErrorPath</key><string>${esc(logFile)}</string>
</dict>
</plist>
`;
}

export const WIN_TASK = 'RefundSlothNightly';
export const winCmdPath = () => path.join(dataPaths().root, 'nightly.cmd');

/** Windows: a .cmd wrapper (keeps the schtasks /TR value short and quoting simple). */
export function buildWinCmd() {
  const pct = (s: string) => s.replace(/%/g, '%%');
  const cli = path.join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts');
  const logFile = path.join(dataPaths().root, 'nightly.log');
  return [
    '@echo off',
    `cd /d "${pct(REPO_ROOT)}"`,
    'set NODE_NO_WARNINGS=1',
    `set "SLOTH_DATA_DIR=${pct(dataPaths().root)}"`,
    `"${pct(process.execPath)}" --import "${pct(import.meta.resolve('tsx/esm'))}" "${pct(cli)}" run >> "${pct(logFile)}" 2>&1`,
    '',
  ].join('\r\n');
}

export function installSchedule(expr: string) {
  if (process.platform === 'win32') {
    const { Hour, Minute } = hourMinute(expr);
    const cmd = winCmdPath();
    fs.mkdirSync(path.dirname(cmd), { recursive: true });
    fs.writeFileSync(cmd, buildWinCmd());
    const at = `${String(Hour).padStart(2, '0')}:${String(Minute).padStart(2, '0')}`;
    execFileSync('schtasks', ['/Create', '/F', '/SC', 'DAILY', '/TN', WIN_TASK, '/TR', `"${cmd}"`, '/ST', at], { stdio: 'ignore', windowsHide: true });
    return `Task Scheduler "${WIN_TASK}" at ${at} → ${cmd}`;
  }
  if (process.platform !== 'darwin') throw new Error('Scheduler install supports macOS and Windows. On Linux keep `sloth serve` running (it has a built-in nightly cron) or add `sloth run` to crontab.');
  const p = plistPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buildPlist(expr));
  const domain = `gui/${process.getuid?.() ?? 501}`;
  try { execFileSync('launchctl', ['bootout', domain, p], { stdio: 'ignore' }); } catch { /* not loaded */ }
  execFileSync('launchctl', ['bootstrap', domain, p]);
  return p;
}

export function uninstallSchedule() {
  if (process.platform === 'win32') {
    try { execFileSync('schtasks', ['/Delete', '/F', '/TN', WIN_TASK], { stdio: 'ignore', windowsHide: true }); } catch { /* not installed */ }
    fs.rmSync(winCmdPath(), { force: true });
    return `Task Scheduler "${WIN_TASK}"`;
  }
  if (process.platform !== 'darwin') return 'nothing (no scheduler on this OS)';
  const p = plistPath();
  const domain = `gui/${process.getuid?.() ?? 501}`;
  try { execFileSync('launchctl', ['bootout', domain, p], { stdio: 'ignore' }); } catch { /* not loaded */ }
  if (fs.existsSync(p)) fs.rmSync(p);
  return p;
}
