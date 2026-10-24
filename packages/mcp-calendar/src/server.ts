import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { addDaysISO, dataPaths, today } from '@sloth/shared';
import { buildIcs, writeIcs } from './ics.ts';

const paths = dataPaths();
const server = new McpServer({ name: 'sloth-calendar', version: '0.1.0' });
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

server.registerTool('calendar_create_reminder', {
  description: 'Create an all-day .ics calendar reminder for a deadline, with alarms N days before.',
  inputSchema: { deadline_id: z.string(), title: z.string(), description: z.string(), due_date: z.string(), days_before: z.array(z.number().int()) },
}, async (a) => {
  const ics = buildIcs({ title: a.title, description: a.description, due_date: a.due_date, days_before: a.days_before, uid: a.deadline_id });
  return ok({ ics_path: writeIcs(paths.reminders, a.deadline_id, ics) });
});

server.registerTool('calendar_list_upcoming', {
  description: 'List open deadlines due in the next N days (read-only).',
  inputSchema: { days: z.number().int() },
}, async (a) => {
  if (!fs.existsSync(paths.db)) return ok([]);
  const db = new DatabaseSync(paths.db, { readOnly: true });
  try {
    const rows = db.prepare("SELECT id, type, due_date, amount_at_risk, ics_path FROM deadlines WHERE status = 'open' AND due_date >= ? AND due_date <= ? ORDER BY due_date")
      .all(today(), addDaysISO(today(), a.days));
    return ok(rows);
  } finally { db.close(); }
});

await server.connect(new StdioServerTransport());
console.error('[sloth-calendar] ready');
