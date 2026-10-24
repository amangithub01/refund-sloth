import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import notifier from 'node-notifier';
import { dataPaths } from '@sloth/shared';

const paths = dataPaths();
const server = new McpServer({ name: 'sloth-notify', version: '0.1.0' });
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

server.registerTool('notify_send', {
  description: 'Show a local macOS notification (no network).',
  inputSchema: { title: z.string(), message: z.string(), open_url: z.string().optional() },
}, async (a) => {
  if (process.env.SLOTH_NO_NOTIFY === '1') return ok({ ok: true, skipped: true });
  await new Promise<void>((resolve) => {
    notifier.notify({ title: a.title, message: a.message, open: a.open_url ?? 'http://localhost:4747', sound: false, wait: false }, () => resolve());
    setTimeout(resolve, 3000);
  });
  return ok({ ok: true });
});

server.registerTool('notify_write_brief', {
  description: 'Write the morning brief markdown report to ~/RefundSloth/reports/<date>.md',
  inputSchema: { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), markdown: z.string() },
}, async (a) => {
  fs.mkdirSync(paths.reports, { recursive: true });
  const p = path.join(paths.reports, `${a.date}.md`);
  fs.writeFileSync(p, a.markdown);
  return ok({ path: p });
});

await server.connect(new StdioServerTransport());
console.error('[sloth-notify] ready');
