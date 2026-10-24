import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { StoreLinks } from '../api';
import { daysLeft } from '../api';

export const TYPE_ICON: Record<string, string> = { return_by: '🛒', trial_end: '⏳', warranty_until: '🛡️', renewal: '🔁' };
export const TYPE_LABEL: Record<string, string> = { return_by: 'Return by', trial_end: 'Trial ends', warranty_until: 'Warranty until', renewal: 'Renews' };

/** Original logo mark: a gold sloth face in a rounded tile. */
// Brand mark: a sleepy sloth hanging from a branch (original artwork).
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#391a18"/><path d="M4.5 9Q20 5 35.5 9" stroke="#c8ae82" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="33" cy="5.8" rx="2.7" ry="1.3" transform="rotate(-25 33 5.8)" fill="#9aa394"/><path d="M11 21Q8.6 14 10.6 8.4M29 21Q31.4 14 29.4 8.4" stroke="#c8ae82" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M9.2 7.4q1.4 2 2.9 1.6M30.8 7.4q-1.4 2-2.9 1.6" stroke="#f3f0e6" stroke-width="1" fill="none" stroke-linecap="round"/><circle cx="20" cy="22" r="9.8" fill="#c8ae82"/><ellipse cx="20" cy="23.4" rx="7.6" ry="6.2" fill="#f3f0e6"/><ellipse cx="15.9" cy="22" rx="3" ry="1.9" transform="rotate(22 15.9 22)" fill="#4a2522"/><ellipse cx="24.1" cy="22" rx="3" ry="1.9" transform="rotate(-22 24.1 22)" fill="#4a2522"/><path d="M14.5 21.8q1.4 1.1 2.8 0M22.7 21.8q1.4 1.1 2.8 0" stroke="#f3f0e6" stroke-width=".95" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="25.2" rx="1.6" ry="1.05" fill="#391a18"/><path d="M17.9 27.3q2.1 1.4 4.2 0" stroke="#391a18" stroke-width="1" fill="none" stroke-linecap="round"/><circle cx="31" cy="31.6" r="5.2" fill="#c8ae82" stroke="#391a18" stroke-width="1.4"/><path d="M32.6 29.9q-.6-.8-1.6-.8-1.5 0-1.5 1.1c0 1.5 3.2.8 3.2 2.4q0 1.1-1.6 1.1-1.1 0-1.8-.8M31 28.1v7" stroke="#391a18" stroke-width="1" fill="none" stroke-linecap="round"/></svg>`;

export function Logo({ className = 'size-8' }: { className?: string }) {
  return <span className={`inline-block shrink-0 [&>svg]:size-full ${className}`} aria-hidden dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />;
}

export function Countdown({ due, today }: { due: string; today: string }) {
  const d = daysLeft(due, today);
  const label = d < 0 ? `${-d}d ago` : d === 0 ? 'Today' : d === 1 ? '1 day left' : `${d} days left`;
  const color = d <= 3 ? 'bg-negative-soft/50 text-negative'
    : d <= 7 ? 'bg-gold/35 text-ink-muted'
    : 'bg-sage/25 text-sage-dark';
  return <span className={`chip ${color}`}><span className="size-1.5 rounded-full bg-current" />{label}</span>;
}

export function SourceBadge({ source }: { source: string }) {
  if (source === 'llm_guess') return <span className="chip bg-gold/35 text-ink-muted" title="No printed date or known policy – the model guessed. Double-check!">AI guess · check</span>;
  return <span className="chip border border-line text-stone-dark">{source === 'document' ? 'From document' : 'Store policy'}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-stone">{children}</div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'positive' | 'negative' }) {
  const c = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink';
  return (
    <div className="card">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-3 text-[2rem] leading-none tracking-tight ${c}`}>{value}</div>
      {sub && <div className="mt-3 text-xs text-stone-dark">{sub}</div>}
    </div>
  );
}

/** Rounded card with a heading row – the Veyra "widget" look. */
export function Panel({ title, meta, children, className = '', bodyClass = '' }: {
  title: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`card flex min-w-0 flex-col ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        {meta && <div className="eyebrow text-[10px]">{meta}</div>}
      </div>
      <div className={`flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Loader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid place-items-center py-28 text-center">
      <Logo className="size-12 animate-pulse" />
      <div className="eyebrow mt-4">{label}…</div>
    </div>
  );
}

export function burst() {
  for (let i = 0; i < 14; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.textContent = ['🦥', '💰', '🍃', '✨'][i % 4]!;
    el.style.left = `${10 + Math.random() * 80}vw`;
    el.style.animationDelay = `${Math.random() * 0.3}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
}

/** "Cancel now ↗" / "Start return ↗": opens the store's own page in a new tab (links.json). */
export function StoreLink({ links, kind, small, className = '' }: { links?: StoreLinks; kind: 'cancel' | 'return'; small?: boolean; className?: string }) {
  const href = links?.[kind];
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={`${kind === 'cancel' ? 'Cancel' : 'Start a return'} on ${new URL(href).hostname}`}
      className={`btn-ghost ${small ? 'px-3! py-1.5! text-xs!' : ''} ${className}`}>
      {kind === 'cancel' ? (small ? 'Cancel' : 'Cancel now') : (small ? 'Return' : 'Start return')} <ExternalLink size={small ? 11 : 13} />
    </a>
  );
}
