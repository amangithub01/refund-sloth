# Decisions log

One line per judgment call, with the reason.

| # | Decision | Why |
|---|---|---|
| 1 | **npm workspaces instead of pnpm** | `corepack`/pnpm 12 crashed with `MODULE_NOT_FOUND` on this machine; npm workspaces need zero extra tooling. |
| 2 | **`node:sqlite` (built-in) instead of better-sqlite3** | No native compilation, nothing to download at install time. Node ≥ 22 required. The ExperimentalWarning is silenced with `NODE_NO_WARNINGS=1`. |
| 3 | **TypeScript run directly with `tsx`, no build step for Node packages** | Faster iteration; each package exports `./src/index.ts`. Only the dashboard (Vite) is built. Type safety is enforced by `tsc --noEmit`. |
| 4 | **Hybrid design: rules for math, LLM for reading/writing** | Dates, recurring-charge detection, duplicate/zombie flags and all money totals are deterministic code (testable, never hallucinated). The LLM does what rules can't: reading messy receipts/emails, guessing unknown store policies, naming/categorising subscriptions, writing emails, and the Boss's commentary. |
| 5 | **Every LLM output is a zod schema → JSON Schema passed to Ollama `format`, validated, retried twice** | Structured outputs on local models are reliable when constrained; retries catch the rest. |
| 6 | **Deadline source priority: document → policies.json → LLM guess** | Printed dates are truth, store policies are next best, an LLM guess is shown as "AI guess – check" with confidence < 0.5. |
| 7 | **Warranty deadlines only for items ≥ $50 with a known warranty length** | Avoids noisy reminders for socks. |
| 8 | **Ghostwriter skips anything that already has an action in any status** | Re-running every night must never re-draft something you dismissed. |
| 9 | **"Cuttable" = zombies + the priciest service in each duplicate group** | Flagging 4 streaming services doesn't mean you'll cancel all 4. |
| 10 | **Boss runs an agentic tool-calling loop with read-only ledger tools; the pipeline (not the LLM) writes the brief file and sends the notification** | The model reviews and comments; side-effects stay deterministic. |
| 11 | **`single` profile (qwen3.5:35b does vision too) and `lite` profile (qwen3:8b + qwen2.5vl:3b)** | One model to download, or one that fits 8–16 GB laptops. |
| 12 | **Official `@modelcontextprotocol/server-filesystem`, rooted at the inbox, read-only tools only** | Uses the open standard and proves the agents can't read or write outside the drop folder. |
| 13 | **The sloth never sends email or pays anything** | Approve = copy to clipboard / open `mailto:`. Human in the loop, always. |
| 14 | **API binds to 127.0.0.1 and rejects non-localhost `Host` headers** | Blocks DNS-rebinding attacks from random websites against your financial data. |
| 15 | **`SLOTH_TODAY` env var for a reproducible demo/eval date (2026-10-21)** | Fixtures have fixed dates; deadlines must line up every time. |
| 16 | **Description normaliser strips state codes + a list of common cities instead of "any two words before a state"** | The greedy version turned "PLANET FIT CLUB BOSTON MA" into "PLANET FIT" and merged iCloud with Apple Music (caught by unit tests). |
| 17 | **iCloud + Dropbox are flagged as duplicate cloud storage** | Consistent with the "≥ 2 in music/cloud/fitness" rule; `expected.json` was updated to match the documented rule. |
| 18 | **Email layout (greeting, paragraphs, sign-off) is done in code (`format-email.ts`), not by the prompt; the model gets `days_left` instead of today's date** | Prompt-only formatting was ignored by the local model (one-line bodies, "as today is…", greeting the wrong company). Deterministic post-processing fixed all three and is unit-tested. |
| 19 | **UI uses a Veyra-inspired light theme (cream/burgundy palette, Instrument Sans + Inter + IBM Plex Mono, pill buttons, rounded cards). Fonts are bundled via `@fontsource`.** | Only the visual style was borrowed: the logo, sloth artwork and all copy are original. Local fonts keep the dashboard fully offline, with no Google Fonts requests. |
| 20 | **Mail sync = read-only IMAP + app password in the macOS Keychain, not the Gmail API/OAuth** | OAuth needs a Google Cloud project, a client secret and app verification: a cloud dependency and an "API key" in all but name. IMAP works with Gmail, iCloud, Outlook and Fastmail, the mailbox is opened `readOnly`, only matching emails become `.eml` files in the inbox, so the rest of the pipeline is unchanged. |
| 21 | **"Cancel now" = a link to the store's cancel page (`links.json`), not auto-cancelling** | Stores have no cancel API and scraping logged-in pages is brittle and risky. The user clicks the final button, which keeps decision #13 (human in the loop). |
| 22 | **Urgent alerts: deadlines (excluding warranties) due within `urgentDays` (default 2) get a separate notification + dashboard banner** | The brief is a summary; a "2 days left" trial deserves its own interruption. Warranties are months long, so they're excluded. |
