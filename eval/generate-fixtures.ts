/**
 * Generates FAKE demo data (no real personal data) into eval/fixtures.
 * Base "today" for the demo is 2026-10-21.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- deterministic PRNG ----------
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)]!;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- receipt images (SVG -> PNG) ----------
async function receiptPng(file: string, lines: string[]) {
  const w = 560, lh = 30, h = 80 + lines.length * lh;
  const text = lines.map((l, i) => {
    const bold = l.startsWith('**'); const t = bold ? l.slice(2) : l;
    return `<text x="40" y="${60 + i * lh}" font-family="Courier New, Menlo, monospace" font-size="${bold ? 24 : 20}" font-weight="${bold ? 700 : 400}" fill="#222">${esc(t)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fbfaf6"/>${text}</svg>`;
  await sharp(Buffer.from(svg)).rotate(1.2, { background: '#e9e4d8' }).png().toFile(path.join(OUT, file));
}

await receiptPng('receipt_bestbuy.png', [
  '**BEST BUY  #1123', 'Store 1123 - Austin, TX', '(512) 555-0142', '--------------------------------',
  'Date: 10/12/2026     14:32', 'Order#: BBY01-806512', '--------------------------------',
  'SONY WH-1000XM5 HEADPHONES', '  SKU 6505727          $329.99', 'SALES TAX               $18.01',
  '--------------------------------', '**TOTAL                $348.00', 'VISA ****4421', '',
  'Returns accepted within 15 days', 'with receipt. Thank you!',
]);
await receiptPng('receipt_target.png', [
  '**TARGET', 'Store T-2291  Seattle, WA', '--------------------------------', '09/30/2026  18:05',
  'NINJA AIR FRYER 5QT        84.99', 'TAX                         5.00', '--------------------------------',
  '**TOTAL                    89.99', 'REF# 2291-0930-7781', 'Thanks for shopping at Target!',
]);

// ---------- PDF invoices ----------
function pdf(file: string, build: (d: PDFKit.PDFDocument) => void) {
  return new Promise<void>((resolve) => {
    const d = new PDFDocument({ size: 'A4', margin: 50 });
    const s = fs.createWriteStream(path.join(OUT, file));
    d.pipe(s); build(d); d.end(); s.on('finish', () => resolve());
  });
}
await pdf('invoice_apple.pdf', (d) => {
  d.fontSize(22).text('Apple Store').moveDown(0.5).fontSize(11)
    .text('Invoice / Receipt').text('Order Number: W123456789').text('Invoice Date: October 15, 2026')
    .text('Billed to: Priya K., priya@example.com').moveDown()
    .text('Item                                   Qty     Price').text('AirPods Pro (2nd generation)           1       $229.00')
    .text('Tax                                                     $20.00').moveDown()
    .fontSize(14).text('Total: $249.00').fontSize(9).moveDown()
    .text('You may return most products within 14 days of receipt. Contact: support@apple.example');
});
await pdf('invoice_ikea.pdf', (d) => {
  d.fontSize(22).text('IKEA').moveDown(0.5).fontSize(11)
    .text('Sales receipt').text('Order no: 1458822931').text('Date: 2026-08-01').moveDown()
    .text('LAGKAPTEN / ALEX desk, white 140x60 cm      1 x 199.00').moveDown()
    .fontSize(14).text('Total USD 199.00').fontSize(9).moveDown()
    .text('Changed your mind? You have 365 days to return new, unopened products.');
});

// ---------- emails ----------
const eml = (o: { from: string; to?: string; subject: string; date: string; body: string }) =>
  `From: ${o.from}\r\nTo: ${o.to ?? 'Priya <priya@example.com>'}\r\nSubject: ${o.subject}\r\nDate: ${o.date}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${o.body.replace(/\n/g, '\r\n')}\r\n`;

fs.writeFileSync(path.join(OUT, 'amazon_order.eml'), eml({
  from: 'Amazon.com <auto-confirm@amazon.example>', subject: 'Your Amazon.com order #112-1234567-7654321', date: 'Mon, 05 Oct 2026 09:12:00 -0700',
  body: `Hello Priya,

Thank you for shopping with us. Your order has been placed.

Order #112-1234567-7654321
Placed on October 5, 2026

Kindle Paperwhite (16 GB) - Agave Green     $149.99
Shipping                                     $0.00
Tax                                          $10.00
Order Total:                               $159.99

Return window closes Nov 4, 2026.
Questions? Contact cs-reply@amazon.example`,
}));
fs.writeFileSync(path.join(OUT, 'adobe_trial.eml'), eml({
  from: 'Adobe <mail@adobe.example>', subject: 'Your Adobe Creative Cloud free trial has started', date: 'Sun, 18 Oct 2026 20:40:00 -0700',
  body: `Hi Priya,

Welcome to Creative Cloud! Your 7-day free trial of Creative Cloud All Apps started today.

Your trial ends on Oct 25, 2026. After that, you'll be charged US$59.99/mo
unless you cancel before the trial ends.

Manage your plan: account.adobe.example/plans
Support: support@adobe.example`,
}));
fs.writeFileSync(path.join(OUT, 'audible_trial.eml'), eml({
  from: 'Audible <no-reply@audible.example>', subject: 'Welcome to Audible Premium Plus - your free trial', date: 'Thu, 01 Oct 2026 08:00:00 -0700',
  body: `Hi Priya,

Your Audible Premium Plus free trial starts today. Enjoy 1 credit and thousands of included titles.

After your free trial, your membership renews automatically at $14.95/month.
You can cancel anytime from your account settings.

- The Audible team (support@audible.example)`,
}));
fs.writeFileSync(path.join(OUT, 'peacock_trial.eml'), eml({
  from: 'Peacock <no-reply@peacocktv.example>', subject: 'Your Peacock Premium free trial ends soon', date: 'Fri, 16 Oct 2026 09:15:00 -0700',
  body: `Hi Priya,

Just a heads-up: your Peacock Premium free trial ends on October 23, 2026.
After that, your plan renews automatically at $7.99/month.

Don't want to continue? Cancel anytime in Account > Plans & Payment.

- Peacock Support (support@peacocktv.example)`,
}));

// ---------- mbox ----------
const mboxMsg = (from: string, envDate: string, e: Parameters<typeof eml>[0]) => `From ${from} ${envDate}\n${eml(e).replace(/\r\n/g, '\n')}\n`;
fs.writeFileSync(path.join(OUT, 'newsletters.mbox'), [
  mboxMsg('deals@shoes.example', 'Fri Oct  2 10:00:00 2026', { from: 'ShoeHub <deals@shoes.example>', subject: 'Fall sale: 40% off sneakers 👟', date: 'Fri, 02 Oct 2026 10:00:00 -0700', body: 'Huge savings this weekend only. Shop now and look great.' }),
  mboxMsg('no-reply@spotify.example', 'Sat Oct  3 06:00:00 2026', { from: 'Spotify <no-reply@spotify.example>', subject: 'Your Spotify Premium receipt', date: 'Sat, 03 Oct 2026 06:00:00 -0700', body: 'Thanks for your payment.\nSpotify Premium Individual - monthly subscription\nAmount: $11.99\nDate: Oct 3, 2026\nNext billing date: Nov 3, 2026' }),
  mboxMsg('news@blog.example', 'Mon Oct  5 12:00:00 2026', { from: 'Weekly Dev Digest <news@blog.example>', subject: 'This week in TypeScript', date: 'Mon, 05 Oct 2026 12:00:00 -0700', body: 'Five articles you might like. Happy reading!' }),
  mboxMsg('help@nytimes.example', 'Sat Oct 10 07:00:00 2026', { from: 'The New York Times <help@nytimes.example>', subject: 'Your NYT subscription will renew soon', date: 'Sat, 10 Oct 2026 07:00:00 -0700', body: 'Hi Priya,\nYour introductory rate has ended. Your New York Times digital subscription renews monthly at $6.25 starting Nov 10, 2026.\nManage: help@nytimes.example' }),
  mboxMsg('orders@dell.example', 'Fri Sep 25 15:00:00 2026', { from: 'Dell <orders@dell.example>', subject: 'Dell order confirmation #7781234', date: 'Fri, 25 Sep 2026 15:00:00 -0700', body: 'Thank you for your purchase!\nOrder #7781234 placed Sep 25, 2026\nXPS 14 Laptop - $1,299.00\nIncludes 1-year limited hardware warranty.\nReturns accepted within 30 days of invoice.\nSupport: support@dell.example' }),
].join(''));

// ---------- bank CSV (13 months of a checking account) ----------
type Row = [string, string, number];
const rows: Row[] = [];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const months: [number, number][] = [];
for (let i = 0; i < 13; i++) { const m0 = 9 + i; months.push([2025 + Math.floor(m0 / 12), (m0 % 12) + 1]); } // 2025-10 .. 2026-10
const monthlySubs: { desc: string; day: number; amt: number | ((i: number) => number) }[] = [
  { desc: 'NETFLIX.COM 866-579-7172 CA', day: 5, amt: 15.49 },
  { desc: 'HULU 877-8244858 CA', day: 9, amt: 17.99 },
  { desc: 'DISNEY PLUS 888-905-7888 CA', day: 12, amt: 13.99 },
  { desc: 'MAX.COM 855-442-6629 NY', day: 14, amt: 16.99 },
  { desc: 'SPOTIFY USA 877-7781161 NY', day: 3, amt: 11.99 },
  { desc: 'APPLE.COM/BILL APPLE MUSIC 866-712-7753 CA', day: 7, amt: 10.99 },
  { desc: 'APPLE.COM/BILL ICLOUD 866-712-7753 CA', day: 16, amt: 2.99 },
  { desc: 'PLANET FIT CLUB #1234 BOSTON MA', day: 1, amt: 24.99 },
  { desc: 'NYTIMES *NYTDIGITAL', day: 10, amt: (i) => (i === 12 ? 6.25 : 4.0) },
  { desc: 'DROPBOX*7HX2K DROPBOX.COM CA', day: 18, amt: 11.99 },
  { desc: 'AI TOOL PRO SUBSCR SAN FRANCISCO CA', day: 20, amt: 20.0 },
];
months.forEach(([y, m], i) => {
  for (const s of monthlySubs) {
    const date = iso(y, m, s.day);
    if (date > '2026-10-20') continue;
    rows.push([date, s.desc, typeof s.amt === 'function' ? s.amt(i) : s.amt]);
  }
});
rows.push(['2025-11-03', 'ADOBE *CREATIVE CLD ANNUAL 408-536-6000 CA', 239.88]);
const noise = ['WHOLE FOODS MKT #10234', 'SHELL OIL 57442', 'STARBUCKS STORE #1182', 'UBER *TRIP HELP.UBER.COM', 'AMAZON MKTPL*2K4L1', 'TRADER JOE S #552', 'CVS/PHARMACY #0912', 'CHIPOTLE 1123'];
for (let i = 0; i < 90; i++) {
  const [y, m] = pick(months); const d = 1 + Math.floor(rand() * 28);
  const date = iso(y, m, d); if (date > '2026-10-20') continue;
  rows.push([date, pick(noise), Math.round((5 + rand() * 120) * 100) / 100]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
const credits = months.map(([y, m]) => [iso(y, m, 15), 'ACME CORP PAYROLL', 4200] as Row).filter((r) => r[0] <= '2026-10-20');
const all = [...rows.map(([d, desc, a]) => [d, desc, -a] as Row), ...credits].sort((a, b) => a[0].localeCompare(b[0]));
fs.writeFileSync(path.join(OUT, 'bank_statement.csv'),
  'Date,Description,Amount\n' + all.map(([d, desc, a]) => `${d},"${desc}",${a.toFixed(2)}`).join('\n') + '\n');

// ---------- a non-receipt image (should not crash, low confidence) ----------
const meme = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400"><rect width="100%" height="100%" fill="#7cc4a4"/>
<circle cx="250" cy="180" r="110" fill="#8b6b4a"/><circle cx="210" cy="160" r="22" fill="#2b2420"/><circle cx="290" cy="160" r="22" fill="#2b2420"/>
<path d="M210 220 Q250 250 290 220" stroke="#2b2420" stroke-width="8" fill="none"/>
<text x="250" y="370" font-family="Helvetica, Arial" font-size="28" text-anchor="middle" fill="#fff">me after 14 hours of sleep</text></svg>`;
await sharp(Buffer.from(meme)).jpeg({ quality: 85 }).toFile(path.join(OUT, 'random_meme.jpg'));

console.log(`Fixtures written to ${OUT}:`);
for (const f of fs.readdirSync(OUT)) console.log('  -', f, `${fs.statSync(path.join(OUT, f)).size} bytes`);
