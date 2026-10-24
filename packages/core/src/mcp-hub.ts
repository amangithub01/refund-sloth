import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool as OllamaTool } from 'ollama';
import { dataPaths, REPO_ROOT } from '@sloth/shared';
import { log } from './events.ts';

interface ToolEntry { server: string; client: Client; name: string; description: string; inputSchema: Record<string, unknown> }

const require = createRequire(import.meta.url);
const TSX_LOADER = import.meta.resolve('tsx/esm');

/** Read-only tools we allow from the official filesystem server. */
const FS_ALLOW = new Set(['list_directory', 'list_directory_with_sizes', 'directory_tree', 'get_file_info', 'search_files', 'read_text_file', 'list_allowed_directories']);

export class McpHub {
  private clients = new Map<string, Client>();
  readonly tools = new Map<string, ToolEntry>();

  async start(opts: { filesystem?: boolean } = {}) {
    const env = { ...process.env, NODE_NO_WARNINGS: '1', SLOTH_DATA_DIR: dataPaths().root } as Record<string, string>;
    const own = (pkg: string) => ({ command: process.execPath, args: ['--import', TSX_LOADER, path.join(REPO_ROOT, 'packages', pkg, 'src', 'server.ts')] });
    const servers: Record<string, { command: string; args: string[] }> = {
      ledger: own('mcp-ledger'), docs: own('mcp-docs'), calendar: own('mcp-calendar'), notify: own('mcp-notify'), mail: own('mcp-mail'),
    };
    if (opts.filesystem !== false) {
      const fsPkg = path.dirname(require.resolve('@modelcontextprotocol/server-filesystem/package.json'));
      servers.filesystem = { command: process.execPath, args: [path.join(fsPkg, 'dist', 'index.js'), dataPaths().inbox] };
    }
    await Promise.all(Object.entries(servers).map(async ([name, s]) => {
      const client = new Client({ name: `refund-sloth-${name}`, version: '0.1.0' });
      await client.connect(new StdioClientTransport({ command: s.command, args: s.args, env, stderr: 'ignore' }));
      this.clients.set(name, client);
      const { tools } = await client.listTools();
      for (const t of tools) {
        if (name === 'filesystem' && !FS_ALLOW.has(t.name)) continue;
        const key = name === 'filesystem' ? `fs_${t.name}` : t.name;
        this.tools.set(key, { server: name, client, name: t.name, description: t.description ?? '', inputSchema: t.inputSchema as Record<string, unknown> });
      }
    }));
    log('system', `MCP hub connected: ${[...this.clients.keys()].join(', ')} (${this.tools.size} tools)`);
    return this;
  }

  serverSummary() {
    const out: Record<string, string[]> = {};
    for (const [k, t] of this.tools) (out[t.server] ??= []).push(k);
    return out;
  }

  toOllamaTools(names: string[]): OllamaTool[] {
    return names.map((n) => {
      const t = this.tools.get(n);
      if (!t) throw new Error(`Unknown MCP tool ${n}`);
      return { type: 'function', function: { name: n, description: t.description, parameters: t.inputSchema as OllamaTool['function']['parameters'] } };
    });
  }

  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const t = this.tools.get(name);
    if (!t) throw new Error(`Unknown MCP tool ${name}`);
    const res = await t.client.callTool({ name: t.name, arguments: args });
    const content = (res.content ?? []) as { type: string; text?: string }[];
    const text = content.find((c) => c.type === 'text')?.text ?? '';
    if (res.isError) throw new Error(`${name}: ${text}`);
    try { return JSON.parse(text) as T; } catch { return text as T; }
  }

  async close() {
    await Promise.allSettled([...this.clients.values()].map((c) => c.close()));
    this.clients.clear(); this.tools.clear();
  }
}
