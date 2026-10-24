import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, useReview, type Item } from '../api';
import { Empty } from './ui';

function Row({ it }: { it: Item }) {
  const qc = useQueryClient();
  const [merchant, setMerchant] = useState(it.merchant);
  const [amount, setAmount] = useState(it.amount?.toString() ?? '');
  const [date, setDate] = useState(it.purchase_date ?? '');
  const save = async () => {
    await api.patch(`/api/items/${it.id}`, { merchant, amount: amount ? Number(amount) : null, purchase_date: date || null });
    qc.invalidateQueries();
  };
  const cls = 'field';
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-line py-4">
      <div className="w-full text-xs text-stone-dark">{it.item_name ?? it.kind} · confidence {Math.round(it.confidence * 100)}%</div>
      <input className={cls} value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      <input className={`${cls} w-24`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="amount" />
      <input className={cls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button className="btn-primary" onClick={save}>Looks right</button>
    </div>
  );
}

export default function NeedsLook({ onClose }: { onClose: () => void }) {
  const { data = [] } = useReview();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="card p-6!">
        <div className="mb-2 flex items-start justify-between">
          <div><div className="eyebrow text-[10px]">Low confidence</div><h2 className="text-2xl">Needs a look</h2></div>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="text-sm text-stone-dark">The model wasn't sure about these. Fix anything wrong – deadlines are recalculated.</p>
        {data.length ? data.map((it) => <Row key={it.id} it={it} />) : <Empty>All clear ✅</Empty>}
      </div>
      </div>
    </div>
  );
}
