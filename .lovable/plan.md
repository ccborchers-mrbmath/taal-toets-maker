## Credit costs (per operation)

Sized from actual model costs. A "paper" ≈ 5 exercises.

| Operation | Credits | Notes |
|---|---|---|
| Text generation (full paper script) | 1 | Lovable AI, cheap |
| Image generation (per option image) | 1 | ~2 images per exercise avg |
| Audio generation (per exercise MP3) | 4 | ElevenLabs, expensive |
| Full-paper audio stitch | 0 | Just concatenation |
| Segment regenerate (audio editor) | 1 | Small partial re-render |

**Paper cost estimate:** 1 text + ~10 images + ~20 audio ≈ **~31 credits/paper**. Round to **30**.

## Pricing tiers

| Product | Credits | Price (ZAR) | Rationale |
|---|---|---|---|
| **Basic (monthly)** | 70 | R149/mo | 2 papers + ~10 credits leeway |
| **Pro (monthly)** | 160 | R329/mo | 5 papers + ~10 credits leeway |
| **Top-up: 1 paper** | 35 | R79 | One-off |
| **Top-up: 2 papers** | 65 | R149 | One-off |

I'll ask you to confirm prices before creating Stripe products.

## Rollover & cancellation rules

- On monthly renewal: unused **subscription credits** roll over **once** (max 1 month's worth of grants held in reserve). Anything older is dropped at renewal.
- Top-up credits: **no expiry** (they're one-off purchases you paid for).
- Cancellation: subscription stays active until period end; credits granted for the current period remain valid until period end, then expire (no further rollover).
- Insufficient balance → generation is rejected up-front with a "top up or upgrade" prompt.

## Data model

New tables:
- `credit_grants` — every issuance (subscription monthly grant, top-up, signup bonus). Columns: `id, user_id, amount, remaining, source ('subscription'|'topup'|'bonus'|'refund'), expires_at nullable, created_at`. FIFO consumption respects `expires_at`.
- `subscriptions` — `user_id, stripe_customer_id, stripe_subscription_id, tier ('basic'|'pro'), status, current_period_end, cancel_at_period_end`.
- `credit_prices` — server-authoritative cost map for `audio_exercise | image_option | text_paper | segment_regenerate`. Read on every debit; not editable client-side.

Existing `credit_balances` becomes a materialized view over `sum(remaining)` on non-expired grants — or we replace uses of it with a `get_available_credits(user_id)` SQL function. I'll go with the function approach for correctness.

Existing `credit_ledger` keeps recording every debit/credit event (audit trail).

## Server flow

- **Debit**: new `spend_credits(user_id, amount, reason, ref)` RPC — atomic: checks balance, decrements grants FIFO by `expires_at`, writes ledger row. Called by `audio.functions`, `images.functions`, `generate.functions`, `audio-segments.functions` before hitting the paid API.
- **Cost lookup**: `get_credit_cost(operation)` reads `credit_prices`.
- **Stripe webhook** at `/api/public/webhooks/stripe`: signature-verified handler for `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.paid`. Creates grants (with `expires_at = period_end + 1 month` for subscription, `null` for top-ups), updates `subscriptions` row.
- **Monthly rollover**: on `invoice.paid` renewal, drop any grants with `expires_at < now()` (i.e. older than 1 period), then insert the new grant.

## UI

- `/pricing` — replace placeholder tiers with real ones + "Subscribe" / "Buy credits" buttons that hit Stripe Checkout.
- `/account` (new) or extend dashboard — show current plan, next renewal date, cancel button (via Stripe billing portal), full credit history from ledger, breakdown of subscription vs top-up credits.
- `CreditBalance` component — show total; on hover show subscription-remaining and top-up-remaining separately.
- Insufficient balance → toast + link to `/pricing`.

## Ordering (why this order)

1. **Enable Stripe** (`enable_stripe_payments`) — required before creating products.
2. **Confirm final prices** with you.
3. **Migration**: `credit_grants`, `subscriptions`, `credit_prices`, RPCs, seed prices, migrate existing `credit_balances` values into initial grants so no user loses credits.
4. **Server functions**: `spendCredits`, updated generators.
5. **Stripe products** via `batch_create_product` (available after step 1).
6. **Webhook route** + Checkout server fns.
7. **UI**: pricing page, account page, updated CreditBalance.
8. **Test**: sandbox checkout → webhook → grant landed → generate a paper → balance decrements correctly.

This is a big change (~10 files, 2 migrations). I'll do it in one continuous pass and verify at the end.
