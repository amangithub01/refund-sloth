# 🧪 Refund Sloth eval results

- **Date:** 2026-10-22 · pretend-today 2026-10-21
- **Profile:** `full` → boss=`qwen3.5:35b`, reader_text=`qwen3.5:35b`, reader_vision=`qwen2.5vl:7b`, deadlineHawk=`qwen3.5:35b`, auditor=`qwen3.5:35b`, ghostwriter=`qwen3.5:35b`
- **Hardware:** Apple M3 Max, 48 GB RAM · Ollama local, no network calls

| Metric | Score |
|---|---|
| Field accuracy (merchant / amount / purchase date) | **96.7%** (29/30) |
| Deadline accuracy (type + date ±1 day) | **100.0%** (14/14) |
| Subscription recall | **100.0%** (12/12) |
| Subscription flag accuracy | **100.0%** (12/12) |
| False-positive subscriptions | 0 |
| Extra/unexpected items | 0 |
| Drafts queued | 10 |
| Total run time | 189 s (18.9 s/file) |
| Failed files | 0 |

## Per file
| File | Fields | Deadlines | Extra items |
|---|---|---|---|
| receipt_bestbuy.png | 3/3 | 2/2 |  |
| receipt_target.png | 3/3 | 1/1 |  |
| invoice_apple.pdf | 3/3 | 2/2 |  |
| invoice_ikea.pdf | 3/3 | 1/1 |  |
| amazon_order.eml | 3/3 | 2/2 |  |
| adobe_trial.eml | 2/3 | 1/1 |  |
| audible_trial.eml | 3/3 | 1/1 |  |
| newsletters.mbox | 9/9 | 4/4 |  |
| random_meme.jpg | ✅ ignored | – |  |

## Subscriptions
| Expected | Found | Expected flags | Got flags | |
|---|---|---|---|---|
| netflix | Netflix ($15.49/mo) | duplicate | duplicate | ✅ |
| hulu | Hulu ($17.99/mo) | duplicate | duplicate | ✅ |
| disney | Disney+ ($13.99/mo) | duplicate | duplicate | ✅ |
| max | Max ($16.99/mo) | duplicate | duplicate | ✅ |
| spotify | Spotify ($11.99/mo) | duplicate | duplicate | ✅ |
| apple music | Apple Music ($10.99/mo) | duplicate | duplicate | ✅ |
| icloud | iCloud+ ($2.99/mo) | duplicate | duplicate | ✅ |
| planet | Planet Fitness ($24.99/mo) | zombie | zombie | ✅ |
| nytimes | The New York Times ($6.25/mo) | price_increase | price_increase | ✅ |
| dropbox | Dropbox ($11.99/mo) | duplicate | duplicate | ✅ |
| ai tool | AI Tool Pro ($20/mo) | zombie | zombie | ✅ |
| adobe | Adobe Creative Cloud ($19.99/mo) | – | – | ✅ |

## Morning brief produced
> 🦥 3 deadlines this week · $86.96/mo you can cut · 10 drafts ready
> Most urgent: ⏳ Adobe Creative Cloud All Apps – trial end 2026-10-25 ($59.99 at stake).
