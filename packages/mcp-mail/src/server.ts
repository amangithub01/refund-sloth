import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadAccount, syncMail } from './mail.ts';

const server = new McpServer({ name: 'sloth-mail', version: '0.1.0' });
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

server.registerTool('mail_status', {
  description: 'Is a mailbox connected? Returns the address, last sync time and how many emails were fetched so far (never the password).',
  inputSchema: {},
}, async () => {
  const a = loadAccount();
  return ok(a ? { connected: true, user: a.user, host: a.host, days: a.days, last_sync: a.last_sync ?? null, fetched_total: a.fetched_total ?? 0 } : { connected: false });
});

server.registerTool('mail_sync', {
  description: 'Read-only IMAP sync: copy recent trial/subscription/receipt/order/return/warranty emails into the Refund Sloth inbox as .eml files.',
  inputSchema: { days: z.number().int().min(1).max(365).optional(), max: z.number().int().min(1).max(1000).optional() },
}, async (a) => ok(await syncMail(a)));

await server.connect(new StdioServerTransport());
console.error('[sloth-mail] ready');
