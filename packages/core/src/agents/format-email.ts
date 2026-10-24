const GREETING = /^\s*((?:hello|hi|dear|good (?:morning|afternoon|evening))\b[^,\n]{0,60},)\s*/i;
const SIGNOFF = /\b(thank you(?: for [^.!\n]{0,60})?|thanks|best regards|kind regards|warm regards|regards|sincerely|best)\s*[,.!]?\s*$/i;
const SIGNOFF_ANYWHERE = /(?:^|[.!?]\s+|\n)\s*(best regards|kind regards|warm regards|sincerely|regards|thanks|thank you|best)\s*,/i;

/**
 * Small local models often return an email as one long line and sometimes repeat "today is ...".
 * Lay it out deterministically: greeting, short paragraphs, sign-off with the user's name and email.
 */
export function formatEmail(raw: string, user: { name: string; email: string }, merchant?: string | null): string {
  let text = raw.replace(/\r/g, '').trim();
  let greeting = 'Hello,';
  const g = text.match(GREETING);
  if (g) { greeting = g[1]!.trim(); text = text.slice(g[0].length); }
  // Models sometimes greet the wrong company; the merchant is known, so set it in code.
  if (merchant) greeting = `Hello ${merchant} team,`;

  // Drop the model's own sign-off and anything after it (name, email); we add a clean one.
  const s = text.match(SIGNOFF_ANYWHERE);
  if (s && s.index !== undefined && text.length - (s.index + s[0].length) < 80) text = text.slice(0, s.index + (s[0].match(/^[.!?]/) ? 1 : 0));
  text = text.replace(new RegExp(`\\s*${escape(user.name)}\\s*$`, 'i'), '').replace(new RegExp(`\\s*${escape(user.email)}\\s*$`, 'i'), '');

  const sentences = text.replace(/\s*\n+\s*/g, ' ').split(/(?<=[.!?]["')\]]?)\s+(?=["'(]?[A-Z0-9])/)
    .map((x) => x.trim().replace(/\btoday's\b/gi, 'the latest')).filter(Boolean)
    .filter((x) => !/\b(as of today|today is|as today is|today,? [A-Z][a-z]+ \d)/i.test(x));

  let closing = 'Thank you,';
  const last = sentences.at(-1);
  if (last && SIGNOFF.test(last) && last.length < 70) { sentences.pop(); if (/thank/i.test(last)) closing = 'Thank you,'; }

  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) paras.push(sentences.slice(i, i + 2).join(' '));
  return [greeting, '', paras.join('\n\n'), '', closing, user.name, user.email].join('\n');
}

function escape(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
