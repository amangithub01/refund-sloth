import { Ollama, type Message, type Tool } from 'ollama';
import { z, type ZodType } from 'zod';
import { log, type AgentName } from './events.ts';

export interface ChatOpts { model: string; messages: Message[]; tools?: Tool[]; format?: object; think?: boolean; agent?: AgentName }

export class LLM {
  readonly client: Ollama;
  constructor(readonly host: string) { this.client = new Ollama({ host }); }

  async chat(o: ChatOpts) {
    for (let attempt = 0; ; attempt++) {
      const t0 = Date.now();
      try {
        const res = await this.client.chat({
          model: o.model, messages: o.messages, tools: o.tools, format: o.format, think: o.think ?? false, stream: false,
          // num_predict caps runaway generations (a stuck reply otherwise hits the 5-minute fetch timeout).
          keep_alive: '15m', options: { temperature: 0.2, num_ctx: 16384, num_predict: 2048 },
        });
        log(o.agent ?? 'system', `llm ${o.model} ${Date.now() - t0}ms`, { model: o.model, ms: Date.now() - t0, ok: true }, 'llm.call');
        return res;
      } catch (e) {
        log(o.agent ?? 'system', `llm ${o.model} failed: ${(e as Error).message}`, { model: o.model, ms: Date.now() - t0, ok: false }, 'llm.call');
        if (attempt >= 1 || !/fetch failed|ECONNRESET|socket|terminated/i.test((e as Error).message)) throw e;
        log(o.agent ?? 'system', 'Ollama connection dropped – retrying once');
      }
    }
  }

  /** Structured output: JSON schema via Ollama `format`, validated by zod, retried with the validation error. */
  async chatJSON<T>(schema: ZodType<T>, o: { model: string; system: string; user: string; images?: string[]; agent?: AgentName; retries?: number }):
    Promise<{ ok: true; data: T } | { ok: false; error: string; raw: string }> {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    delete jsonSchema.$schema;
    const messages: Message[] = [
      { role: 'system', content: `${o.system}\n\nRespond with ONLY a JSON object matching this JSON schema:\n${JSON.stringify(jsonSchema)}` },
      { role: 'user', content: o.user, ...(o.images?.length ? { images: o.images } : {}) },
    ];
    let raw = ''; let error = '';
    for (let attempt = 0; attempt <= (o.retries ?? 2); attempt++) {
      const res = await this.chat({ model: o.model, messages, format: jsonSchema, agent: o.agent });
      raw = res.message.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch (e) { error = `Invalid JSON: ${(e as Error).message}`; }
      if (parsed !== undefined) {
        const r = schema.safeParse(parsed);
        if (r.success) return { ok: true, data: r.data };
        error = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      }
      messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Your JSON failed validation: ${error}. Return ONLY the corrected JSON.` });
      log(o.agent ?? 'system', `retrying invalid JSON (${error.slice(0, 120)})`);
    }
    return { ok: false, error, raw };
  }

  async ping(): Promise<boolean> {
    try { await this.client.list(); return true; } catch { return false; }
  }

  async modelStatus(models: string[]) {
    const installed = (await this.client.list()).models.map((m) => m.name);
    const has = (m: string) => installed.includes(m) || installed.includes(`${m}:latest`);
    return Promise.all([...new Set(models)].map(async (name) => {
      if (!has(name)) return { name, present: false, tools: false, vision: false };
      const info = await this.client.show({ model: name });
      const caps = (info as unknown as { capabilities?: string[] }).capabilities ?? [];
      return { name, present: true, tools: caps.includes('tools'), vision: caps.includes('vision') };
    }));
  }
}
