import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, Mail, RefreshCw, X } from 'lucide-react';
import { api, useMail, type MailStatus } from '../api';

/** Connect a mailbox (read-only IMAP + app password stored in the macOS Keychain). */
export default function MailConnect({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: mail } = useMail();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ['mail'] }); }
  };
  const connect = () => run(async () => {
    await api.post<MailStatus>('/api/mail/connect', { email, app_password: pass });
    setPass('');
    const r = await api.post<{ matched: number; fetched: number }>('/api/mail/sync');
    return `Connected ✓ Found ${r.matched} money emails, copied ${r.fetched} new. Press "Wake the sloth" to process them.`;
  });
  const sync = () => run(async () => {
    const r = await api.post<{ matched: number; fetched: number }>('/api/mail/sync');
    return `${r.matched} matching emails · ${r.fetched} new. ${r.fetched ? 'Press "Wake the sloth" to process them.' : 'Nothing new.'}`;
  });
  const disconnect = () => run(async () => { await api.del('/api/mail'); return 'Disconnected. The password was removed from your Keychain.'; });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-lg p-6!" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div><div className="eyebrow text-[10px]">Read-only · optional</div><h2 className="text-2xl">Let the sloth read your mail</h2></div>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="text-sm text-stone-dark">
          Before every run the sloth checks your inbox for trial, subscription, receipt, order, return and warranty emails and copies
          only those into <code className="text-xs">~/RefundSloth/inbox</code>. It never sends, deletes or marks anything as read.
          The emails are read by your local model, not a cloud AI.
        </p>

        {mail?.connected ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-paper px-4 py-3">
              <Mail size={18} className="text-positive" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-medium">{mail.user}</div>
                <div className="text-xs text-stone-dark">last sync {mail.last_sync ? new Date(mail.last_sync).toLocaleString() : 'never'} · {mail.fetched_total ?? 0} emails so far{mail.has_password === false ? ' · password missing!' : ''}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className="btn-primary" onClick={sync}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Check now</button>
              <button disabled={busy} className="btn-ghost ml-auto" onClick={disconnect}>Disconnect</button>
            </div>
          </div>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); connect(); }}>
            <input className="field w-full" type="email" required placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <input className="field w-full" type="password" required placeholder="16-letter app password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
            <ol className="list-decimal space-y-1 pl-5 text-xs text-stone-dark">
              <li>Gmail: turn on 2-Step Verification, then create an app password at{' '}
                <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">myaccount.google.com/apppasswords</a>.</li>
              <li>Paste it here. It goes straight into your macOS Keychain, never a file and never a server.</li>
              <li>Outlook, Yahoo and iCloud work too (use their app passwords).</li>
            </ol>
            <button disabled={busy || !email || !pass} className="btn-primary w-full justify-center">
              {busy ? 'Testing login…' : <><Lock size={14} /> Connect read-only</>}
            </button>
          </form>
        )}
        {msg && <p className={`mt-4 text-sm ${msg.ok ? 'text-positive' : 'text-negative'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
