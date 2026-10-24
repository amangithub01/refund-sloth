import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { dataPaths, safeResolve } from '@sloth/shared';
import { classify, readBankCsv, readEmail, readImage, readMbox, readPdf, scanInbox } from './parse.ts';

const { inbox } = dataPaths();
const server = new McpServer({ name: 'sloth-docs', version: '0.1.0' });
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
const inInbox = (p: string) => safeResolve(inbox, p);
const pathArg = { path: z.string().describe('File path inside the RefundSloth inbox') };

server.registerTool('docs_scan_inbox', { description: 'List every file in the inbox with sha256 hash.', inputSchema: {} },
  async () => ok(scanInbox(inbox)));
server.registerTool('docs_classify', { description: 'Classify a file: receipt_image, invoice_pdf, email, mbox, bank_csv, unknown.', inputSchema: pathArg },
  async (a) => ok({ kind: classify(inInbox(a.path)) }));
server.registerTool('docs_read_pdf', { description: 'Extract text from a PDF invoice.', inputSchema: pathArg },
  async (a) => ok(await readPdf(inInbox(a.path))));
server.registerTool('docs_read_email', { description: 'Parse a .eml email into from/to/subject/date/text.', inputSchema: pathArg },
  async (a) => ok(await readEmail(inInbox(a.path))));
server.registerTool('docs_split_mbox', { description: 'Split an .mbox into parsed messages.', inputSchema: pathArg },
  async (a) => ok(await readMbox(inInbox(a.path))));
server.registerTool('docs_read_image', { description: 'Normalize a receipt image to base64 JPEG (max 1600px).', inputSchema: pathArg },
  async (a) => ok(await readImage(inInbox(a.path))));
server.registerTool('docs_read_csv', { description: 'Parse a bank statement CSV into spend transactions.', inputSchema: pathArg },
  async (a) => ok(readBankCsv(inInbox(a.path))));

await server.connect(new StdioServerTransport());
console.error('[sloth-docs] ready');
