# IGCSE Afrikaans (0548) Assessment Generator — Clone Plan (v2)

Building in **this** project as a separate clone. The original Assessment Audio Genius project stays untouched.

## Stack note

Source is Vite + React Router DOM; this project is **TanStack Start** with file-based routing under `src/routes/`. We port pages and shared UI into TanStack equivalents — same screens and flows, same shadcn-based look, different routing internals.

## Scope

- Same screens as source: Dashboard, New Assessment, Assessment Editor, Auth, Pricing, Shop, Privacy, Terms, Refunds, NotFound.
- Same shared UI: AppShell, NavLink, CreditBalance, BuyCreditsDialog, PurchaseHistoryDialog, SubmitToShopDialog, PaymentTestModeBanner, full shadcn `ui/` set.
- Subject locked to **Cambridge IGCSE Afrikaans as a Second Language (0548), Paper 2 Listening** for v1. Other papers can come later.
- EN/AF toggle = **UI chrome only** (nav, buttons, dialogs, form labels, toasts). AI content stays in Afrikaans; stored data is not language-tagged.

## Output must match the 2025 specimen exactly

Reverse-engineered from `0548/02/SP/25`. Generated papers must reproduce this structure 1-for-1:

**Paper-level invariants**
- Title block: "Cambridge IGCSE™ / AFRIKAANS AS A SECOND LANGUAGE / 0548/02 / Paper 2 Listening".
- Duration line: "Approximately 50 minutes (including 6 minutes' transfer time)".
- Standard instructions + information blocks (40 questions, 1 mark each, total 40, multiple choice answer sheet, soft pencil, no dictionaries, etc.) — copied verbatim from the specimen.
- Footer on each page: `© Cambridge University Press & Assessment 2022   0548/02/SP/25` with `[Turn over` on odd right-hand pages — but rendered as the school's own footer (we won't reproduce Cambridge copyright on generated papers; school name + paper code instead). Confirm wording before build.
- Page count target: 16 pages, same pagination breaks where feasible.

**Exercise structure (must match exactly)**
| Exercise | Questions | Format | Plays | Marks |
|---|---|---|---|---|
| Oefening 1 | 1–8 | 8 short recordings, 4-option **picture** MCQ (A–D) | twice each | 8 |
| Oefening 2 | 9–18 | 5 short dialogues (2 questions each), 3-option **text** MCQ (A–C) | twice each | 10 |
| Oefening 3 | 19–26 | One longer monologue/talk, 3-option text MCQ (A–C) | twice | 8 |
| Oefening 4 | 27–32 | 6 speakers, match each to one of 8 statements (A–H) | twice | 6 |
| Oefening 5 | 33–40 | One interview, 3-option text MCQ (A–C) | twice | 8 |
| **Total** |  |  |  | **40** |

- Afrikaans rubrics reproduced verbatim from the specimen (e.g. "Jy sal agt kort opnames hoor. Maak ŉ regmerkie in die korrekte blokkie…", "Kies een stelling (A–H) uit die lys vir vrae 27–32…").
- Question stems open with "Vraag N" and end with `[1]`; each exercise ends with `[Totaal: N]`.
- "Kyk nou vrae 19–26." / "Lees nou stellings A–H." preamble lines included where the specimen has them.
- Multiple-choice answer sheet boxes rendered as `[ ]` checkbox cells.

**Per-item generation contract (passed to the model + validated server-side)**
- Oefening 1 items: produce (a) ~25–40s Afrikaans script, (b) one-line question stem in Afrikaans, (c) 4 short image prompts (A–D, plausible, one correct), (d) answer letter.
- Oefening 2 items: ~30–50s two-speaker dialogue, 2 stems, 3 short text options each, answer letters, named context line ("Jy gaan twee vriende hoor praat oor…").
- Oefening 3: ~2.5–3 min single-speaker talk, 8 stems with 3 text options, answer key. Topic-introduction line in Afrikaans.
- Oefening 4: 6 short monologues (~20–30s each) on one shared theme; produce 8 statement bank A–H where exactly 6 match speakers and 2 are distractors; answer key.
- Oefening 5: ~3–4 min interview transcript (interviewer + interviewee), 8 stems with 3 text options, answer key.
- All scripts written in natural South African Afrikaans, age-appropriate for IGCSE candidates, syllabus-aligned themes (daily life, school, leisure, environment, work/careers, culture, technology).

**Validation gate before any paper is shown to the user**
- Exactly 40 questions in the correct exercise split (8/10/8/6/8).
- Every MCQ has the right number of options (4 for Oef 1, 3 for Oef 2/3/5, single letter A–H for Oef 4).
- Answer key complete, each answer's letter exists in its options.
- Rubrics present verbatim.
- If any check fails, regenerate the failing exercise only.

**Outputs**
- On-screen editor view (rich, editable).
- PDF export styled to match the specimen layout (A4, page numbers, exercise headings, picture cells for Oefening 1).
- Mark scheme PDF (mirrors the official mark scheme: answer key table, total 40).
- Transcript document (mirrors the official transcript: timing cues like "PAUSE 00'05"", "REPEAT", pronunciation of "Vraag 1" etc.) — confirmed by parsing the specimen transcript PDF in build mode and matching its conventions.
- Optional TTS audio for the listening track, generated from the transcript with timed pauses and repeats (Lovable AI text-to-speech).

## Audio: yes, please upload it

Uploading the official specimen **audio file** is genuinely helpful. We'll use it to:
- Calibrate pause lengths, repeat cadence, and "you now have X seconds" timings.
- Match speaker count, accent, and pacing for the TTS-generated audio.
- We will **not** redistribute the audio — it's reference only for tuning generation.

Please attach the listening audio (MP3 / WAV) in your next message.

## UI translation system

- `src/lib/i18n.ts` — minimal dictionary translator, locales `en` + `af`, persisted in `localStorage`, default `af`.
- `<LanguageToggle />` in `AppShell` header (EN | AF segmented control).
- Every user-visible string in ported components goes through `t("key")`. Dictionaries cover: navigation, dashboard, new-assessment form, editor toolbar, auth, pricing, shop, legal page titles, common buttons, toast messages.

## Routes (TanStack)

```
src/routes/
  __root.tsx            (LanguageProvider + AppShell wrapper)
  index.tsx             → Dashboard
  auth.tsx
  assessments.new.tsx
  assessments.$id.tsx
  pricing.tsx
  shop.tsx
  privacy.tsx
  terms.tsx
  refunds.tsx
  api/public/...        (webhooks, e.g. payments)
```
Each route has its own `head()` with AF-default title/description.

## Backend

- Enable **Lovable Cloud** (no backend in this project yet).
- Migrations recreate the source's schema: profiles, user_roles (`has_role` security-definer pattern), assessments, exercises, questions, options, answer_key, credit ledger, purchases, shop submissions. Tables include the syllabus/paper code so future papers (1/3/4) can be added without schema changes.
- Server logic ported as TanStack **server functions** in `src/lib/*.functions.ts`, not Supabase Edge Functions. Webhooks under `src/routes/api/public/*`.
- AI generation uses **Lovable AI Gateway** with `google/gemini-3-flash-preview` for text, plus TTS for audio. Prompts reword the syllabus targets for 0548 Paper 2; reference exemplar excerpts are embedded into the prompt to anchor style.

## Payments / credits

Same model as source (credit packs, test-mode banner). Provider choice (Stripe vs Paddle) deferred — we'll ask before wiring.

## Out of scope (v1)

- Papers 1, 3, 4 (reading, speaking, writing).
- Translating AI outputs.
- Importing data from the source project.

## Build order

1. Enable Lovable Cloud; scaffold i18n + LanguageToggle + AppShell in `__root.tsx`.
2. Port Auth + Dashboard route shell; confirm sign-in.
3. DB schema with GRANTs + RLS.
4. Generation pipeline for Paper 2 with the validation gate above; editor view.
5. PDF export (question paper + mark scheme + transcript) matching specimen layout.
6. TTS audio generation from transcript (after you upload the reference audio).
7. Pricing/Shop/Legal pages.
8. Payments wiring (ask provider first).
9. Final i18n sweep so every screen renders cleanly in EN and AF.
