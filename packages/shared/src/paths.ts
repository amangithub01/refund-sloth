import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const expandHome = (p: string): string => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

/** Repo root (…/refund-sloth). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function dataDir(): string {
  return path.resolve(expandHome(process.env.SLOTH_DATA_DIR ?? '~/RefundSloth'));
}

export const dataPaths = (root = dataDir()) => ({
  root,
  inbox: path.join(root, 'inbox'),
  reminders: path.join(root, 'reminders'),
  reports: path.join(root, 'reports'),
  db: path.join(root, 'sloth.db'),
  config: path.join(root, 'sloth.config.json'),
  lock: path.join(root, '.run.lock'),
  mail: path.join(root, 'mail.json'),
});

/** Resolve `p` and ensure it stays inside `base` (blocks ../ traversal). */
export function safeResolve(base: string, p: string): string {
  const abs = path.resolve(base, p);
  const rel = path.relative(path.resolve(base), abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Path escapes allowed folder: ${p}`);
  return abs;
}
