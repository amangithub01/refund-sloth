import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Copy, Mail, X } from 'lucide-react';
import { api, money, useActions, type Action } from '../api';
import { burst, Empty, StoreLink } from './ui';

function Card({ a }: { a: Action }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState(a.subject ?? '');
  const [body, setBody] = useState(a.body);
  const [to, setTo] = useState(a.to_address ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = subject !== (a.subject ?? '') || body !== a.body || to !== (a.to_address ?? '');
  const save = () => (dirty ? api.patch(`/api/actions/${a.id}`, { subject, body, to_address: to || null }) : Promise.resolve());
  const decide = async (decision: 'approved' | 'snoozed' | 'dismissed') => {
    setBusy(true);
    try {
      await save();
      if (decision === 'approved') {
        if (a.type !== 'review') await navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`).catch(() => {});
        burst();
      }
      await api.post(`/api/actions/${a.id}/decision`, { decision, snooze_days: decision === 'snoozed' ? 3 : undefined });
      qc.invalidateQueries();
    } finally { setBusy(false); }
  };
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="eyebrow mb-1 text-[10px]">{a.type.replace('_', ' ')}{a.due_date ? ` · due ${a.due_date}` : ''}</div>
          <div className="font-heading text-lg font-medium tracking-tight">{a.title}</div>
        </div>
        {a.potential_saving > 0 && (
          <span className="chip num bg-positive-soft/50 text-positive">saves {money(a.potential_saving)}{a.saving_period === 'monthly' ? '/mo' : ''}</span>
        )}
      </div>
      {a.type !== 'review' ? (
        <>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center text-sm">
            <label className="text-stone-dark">To</label>
            <input className="field" value={to} onChange={(e) => setTo(e.target.value)} placeholder="support@merchant.com" />
            <label className="text-stone-dark">Subject</label>
            <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <textarea className="field h-48 w-full p-4! font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      ) : <p className="whitespace-pre-line text-sm">{body}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} className="btn-primary" onClick={() => decide('approved')}>{a.type === 'review' ? <><Check size={15} /> Done</> : <><Copy size={15} /> Approve &amp; copy</>}</button>
        {a.type !== 'review' && <a className="btn-ghost" href={mailto} onClick={() => save()}><Mail size={15} /> Open in Mail</a>}
        <StoreLink links={a.links} kind={a.type === 'return_email' ? 'return' : 'cancel'} />
        <button disabled={busy} className="btn-ghost" title="Snooze 3 days" onClick={() => decide('snoozed')}><Clock size={15} /> Snooze</button>
        <button disabled={busy} className="btn-icon ml-auto size-9!" title="Dismiss" aria-label="Dismiss" onClick={() => decide('dismissed')}><X size={16} /></button>
      </div>
    </div>
  );
}

export default function Queue() {
  const { data = [] } = useActions();
  if (!data.length) return <Empty>Queue is empty. Nap away 🦥💤</Empty>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-dark">The sloth never sends anything. You approve, it copies the email – you paste &amp; send. Or skip the email: “Cancel now” opens the store’s own cancel page.</p>
      <div className="grid gap-6 lg:grid-cols-2">{data.map((a) => <Card key={a.id} a={a} />)}</div>
    </div>
  );
}
