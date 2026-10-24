import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { dataPaths, expandHome, REPO_ROOT } from './paths.ts';

const ModelMap = z.object({
  boss: z.string(),
  reader_text: z.string(),
  reader_vision: z.string(),
  deadlineHawk: z.string(),
  auditor: z.string(),
  ghostwriter: z.string(),
});
export type ModelMap = z.infer<typeof ModelMap>;
export type AgentRole = keyof ModelMap;

export const SlothConfig = z.object({
  dataDir: z.string().default('~/RefundSloth'),
  ollamaHost: z.string().default('http://127.0.0.1:11434'),
  profile: z.string().default('full'),
  profiles: z.record(z.string(), ModelMap),
  schedule: z.string().default('0 2 * * *'),
  reminderDaysBefore: z.array(z.number().int().positive()).default([3, 1]),
  currency: z.string().default('USD'),
  user: z.object({ name: z.string(), email: z.string() }),
  ghostwriterTone: z.enum(['polite', 'firm', 'karen']).default('polite'),
  zombieDays: z.number().int().positive().default(60),
  dashboardPort: z.number().int().default(4747),
  urgentDays: z.number().int().min(0).max(14).default(2),
});
export type SlothConfig = z.infer<typeof SlothConfig>;

export const EXAMPLE_CONFIG_PATH = path.join(REPO_ROOT, 'sloth.config.example.json');

export function loadConfig(): SlothConfig {
  const p = dataPaths().config;
  const src = fs.existsSync(p) ? p : EXAMPLE_CONFIG_PATH;
  const cfg = SlothConfig.parse(JSON.parse(fs.readFileSync(src, 'utf8')));
  if (process.env.OLLAMA_HOST) cfg.ollamaHost = process.env.OLLAMA_HOST.startsWith('http') ? process.env.OLLAMA_HOST : `http://${process.env.OLLAMA_HOST}`;
  if (process.env.SLOTH_PROFILE) cfg.profile = process.env.SLOTH_PROFILE;
  cfg.dataDir = expandHome(cfg.dataDir);
  if (!cfg.profiles[cfg.profile]) throw new Error(`Unknown profile "${cfg.profile}". Available: ${Object.keys(cfg.profiles).join(', ')}`);
  return cfg;
}

export const modelFor = (cfg: SlothConfig, role: AgentRole): string => cfg.profiles[cfg.profile]![role];
