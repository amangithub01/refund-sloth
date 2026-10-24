# 🎬 Demo script (~2 minutes)

**Prep:** `ollama serve` running, models warm (`npm run sloth -- doctor`), `npm run sloth -- reset --yes`, empty `~/RefundSloth/inbox`, dashboard built (`npm run build`).

| Time | Show | Say |
|---|---|---|
| 0:00 | Menu bar → **turn Wi-Fi off** | "Everything you're about to see runs on this laptop. No internet, no API keys." |
| 0:10 | Finder: drag `eval/fixtures/*` into `~/RefundSloth/inbox` | "Receipt photos, invoices, order emails, a bank statement. My usual mess." |
| 0:20 | Terminal: `SLOTH_TODAY=2026-10-21 npm run sloth -- run` | "Normally this runs at 2 AM. Six agents, all local models, talking to MCP tools." Point out 📖 Reader reading the receipt photo, 🦅 Hawk dates, 🧾 Auditor flags, 👻 drafts, 🦥 Boss tool calls. |
| 1:00 | macOS notification + brief at the bottom | "My morning brief." |
| 1:05 | `npm run sloth -- serve` → **Today** | Brief, ⚠️ At risk, urgent list with red/amber countdowns. |
| 1:15 | **Deadlines** | "Best Buy headphones: 6 days left, date from the receipt. Calendar file one click away." |
| 1:25 | **Subscriptions** | "Planet Fitness 🧟: no sign I've used it in 60+ days. Four streaming services 👯. NYT went up 📈." |
| 1:35 | **Action queue** → Planet Fitness → **Approve & copy** | 🦥 confetti. "It never sends anything. It copies, I paste." Back on Today: 💰 Saved +$24.99/mo. |
| 1:45 | Open `~/RefundSloth/sloth.config.json`, `"profile": "lite"` | "Smaller laptop? Swap to an 8B model. One line." |
| 1:55 | Close | "Set it up once, never pay for it, and your bank statement never leaves your Mac. 🦥" |
