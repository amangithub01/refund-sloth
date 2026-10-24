import type { Message } from 'ollama';
import { log, type AgentName } from './events.ts';
import type { LLM } from './llm.ts';
import type { McpHub } from './mcp-hub.ts';

/** Generic tool-calling loop: the model decides which MCP tools to call until it answers in plain text. */
export async function runAgent(o: {
  llm: LLM; hub: McpHub; agent: AgentName; model: string; system: string; input: string; toolNames: string[]; maxSteps?: number;
}): Promise<{ content: string; steps: number; toolCalls: { name: string; args: unknown }[] }> {
  const messages: Message[] = [{ role: 'system', content: o.system }, { role: 'user', content: o.input }];
  const tools = o.hub.toOllamaTools(o.toolNames);
  const toolCalls: { name: string; args: unknown }[] = [];
  for (let step = 1; step <= (o.maxSteps ?? 12); step++) {
    const res = await o.llm.chat({ model: o.model, messages, tools, agent: o.agent });
    messages.push(res.message);
    const calls = res.message.tool_calls ?? [];
    if (!calls.length) return { content: res.message.content, steps: step, toolCalls };
    for (const c of calls) {
      const { name, arguments: args } = c.function;
      toolCalls.push({ name, args });
      log(o.agent, `→ ${name}(${JSON.stringify(args).slice(0, 100)})`, { tool: name }, 'agent.tool');
      let result: unknown;
      if (!o.toolNames.includes(name)) result = { error: `Tool ${name} is not allowed for this agent` };
      else {
        try { result = await o.hub.call(name, args); } catch (e) { result = { error: (e as Error).message }; }
      }
      messages.push({ role: 'tool', tool_name: name, content: JSON.stringify(result).slice(0, 12000) });
    }
  }
  log(o.agent, 'reached max steps');
  const last = messages.at(-1);
  return { content: last?.role === 'assistant' ? last.content : '', steps: o.maxSteps ?? 12, toolCalls };
}
