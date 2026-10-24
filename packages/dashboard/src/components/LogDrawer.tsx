import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useRuns, type SlothEvent } from '../api';

const EMOJI: Record<string, string> = { boss: '🦥', scout: '🔭', reader: '📖', hawk: '🦅', auditor: '🧾', ghost: '👻', system: '⚙️' };

export default function LogDrawer({ open, onClose, events }: { open: boolean; onClose: () => void; events: SlothEvent[] }) {
  const end = useRef<HTMLDivElement>(null);
  const { data: runs = [] } = useRuns();
  const shown = events.filter((e) => e.type !== 'llm.call');
  useEffect(() => { if (open) end.current?.scrollIntoView({ behavior: 'smooth' }); }, [shown.length, open]);
  return (
    <aside className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-line bg-ivory text-ink shadow-2xl transition-[translate,visibility] duration-300 ${open ? 'visible translate-x-0' : 'invisible translate-x-full'}`}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div><div className="eyebrow text-[10px]">Live</div><h2 className="text-xl">Agents talking</h2></div>
        <button onClick={onClose} className="btn-icon" aria-label="Close log"><X size={16} /></button>
      </div>
      <div className="m-4 flex-1 space-y-1 overflow-y-auto rounded-2xl bg-ink p-4 font-mono text-xs text-paper/85">
        {shown.length ? shown.map((e, i) => (
          <div key={i} className={e.type === 'file.failed' ? 'text-negative-soft' : e.type === 'agent.tool' ? 'text-gold' : e.type === 'run.end' ? 'text-positive-soft' : ''}>
            <span className="text-paper/40">{e.ts.slice(11, 19)}</span> {EMOJI[e.agent ?? 'system']} {e.message}
          </div>
        )) : <div className="text-paper/50">Quiet… the sloth is sleeping. Hit "Wake the sloth".</div>}
        <div ref={end} />
      </div>
      <div className="max-h-48 overflow-y-auto border-t border-line px-5 py-4 text-xs">
        <div className="eyebrow mb-2 text-[10px]">Run history</div>
        {runs.map((r) => (
          <div key={r.id} className="num flex justify-between py-0.5 text-stone-dark">
            <span>{r.started_at.replace('T', ' ').slice(0, 16)}</span><span>{r.files_processed} files</span>
            <span>{r.status === 'done' ? '✅' : r.status === 'failed' ? '❌' : '⏳'} {r.status}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
