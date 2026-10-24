import fs from 'node:fs';
import { dataPaths, loadConfig, loadPolicies, type PolicyTable, type SlothConfig } from '@sloth/shared';
import { LLM } from './llm.ts';
import { McpHub } from './mcp-hub.ts';

export interface SlothContext { cfg: SlothConfig; llm: LLM; hub: McpHub; policies: PolicyTable }

export function ensureDataDirs() {
  const p = dataPaths();
  for (const d of [p.root, p.inbox, p.reminders, p.reports]) fs.mkdirSync(d, { recursive: true });
  return p;
}

export async function createContext(opts: { filesystem?: boolean } = {}): Promise<SlothContext> {
  ensureDataDirs();
  const cfg = loadConfig();
  const hub = await new McpHub().start(opts);
  return { cfg, llm: new LLM(cfg.ollamaHost), hub, policies: loadPolicies() };
}
