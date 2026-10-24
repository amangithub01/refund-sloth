import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { McpHub } from './mcp-hub.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-hub-'));
process.env.SLOTH_DATA_DIR = dir;
fs.mkdirSync(path.join(dir, 'inbox'), { recursive: true });
fs.copyFileSync(path.join(import.meta.dirname, '../../../eval/fixtures/amazon_order.eml'), path.join(dir, 'inbox/amazon_order.eml'));
const hub = new McpHub();
afterAll(async () => { await hub.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('MCP hub (real stdio servers)', () => {
  it('connects to all servers and calls tools', async () => {
    await hub.start();
    const s = hub.serverSummary();
    expect(Object.keys(s).sort()).toEqual(['calendar', 'docs', 'filesystem', 'ledger', 'mail', 'notify']);
    expect(s.filesystem).not.toContain('fs_write_file');
    const files = await hub.call<{ name: string }[]>('docs_scan_inbox');
    expect(files.map((f) => f.name)).toEqual(['amazon_order.eml']);
    const stats = await hub.call<{ pending_actions: number }>('ledger_stats');
    expect(stats.pending_actions).toBe(0);
    await expect(hub.call('docs_read_email', { path: '../../etc/hosts' })).rejects.toThrow();
  }, 60000);
});
