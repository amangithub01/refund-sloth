import { EventEmitter } from 'node:events';

export type AgentName = 'boss' | 'scout' | 'reader' | 'hawk' | 'auditor' | 'ghost' | 'system';

export interface SlothEvent {
  type: 'run.start' | 'run.end' | 'agent.start' | 'agent.end' | 'agent.tool' | 'llm.call' | 'file.processed' | 'file.failed' | 'action.queued' | 'log';
  agent?: AgentName;
  message: string;
  data?: Record<string, unknown>;
  ts: string;
}

class Bus extends EventEmitter {
  private history: SlothEvent[] = [];
  emitEvent(e: Omit<SlothEvent, 'ts'>) {
    const ev: SlothEvent = { ...e, ts: new Date().toISOString() };
    this.history.push(ev);
    if (this.history.length > 500) this.history.shift();
    this.emit('event', ev);
    return ev;
  }
  recent(n = 200) { return this.history.slice(-n); }
  onEvent(fn: (e: SlothEvent) => void) { this.on('event', fn); return () => this.off('event', fn); }
}

export const bus = new Bus();
export const log = (agent: AgentName, message: string, data?: Record<string, unknown>, type: SlothEvent['type'] = 'log') =>
  bus.emitEvent({ type, agent, message, data });
