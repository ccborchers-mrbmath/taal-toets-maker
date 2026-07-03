# Plan: Per-segment audio editor (surgical correction page)

Refinement of Part 2. Part 1 (Afrikaans-first phrasing rules) is already shipped.

## Column layout — resolved

You're right that transcript + audio is only two columns. The useful third column is **history / A-B comparison**, not a duplicate of the text. Proposed layout per row:

| # | Speaker | Current text (editable) | Current audio | Previous version |
|---|---------|--------------------------|---------------|-------------------|
| 1 | Verteller | "Oefening 1. Luister…" (textarea) | ▶ 0:04 · Regenerate | ▶ old take · "…tot dusver…" · Revert |
| 2 | Emma | "Lekker verjaarsdag, Emma!" | ▶ 0:03 · Regenerate | ▶ old · "Gelukkige verjaarsdag…" · Revert |

- **Column 3 shows the immediately previous take** (text + audio) after a regenerate. Lets you A/B without losing the old version, and hit "Revert" if the new one is worse.
- We keep just one previous version per row (not full history) — cheap, and matches the "make a small change, listen, decide" workflow. If the new one is good you overwrite; if bad you revert.
- Rows that have never been regenerated show a dash in column 3.

## Storage model

- `exercise-audio/<assessment_id>/<exercise_id>/segments/<script_row_id>.mp3` — current take.
- `exercise-audio/<assessment_id>/<exercise_id>/segments/<script_row_id>.prev.mp3` — previous take (overwritten on each regen).
- `listening_scripts` gets: `audio_path`, `audio_generated_at`, `audio_stale` (bool), `previous_transcript` (text, nullable), `previous_audio_path` (text, nullable), `previous_generated_at`.
- Narrator lines (rubrics, "Vraag N", "Spreker N", endings) are not currently rows in `listening_scripts`. Options:
  - **A (simple):** Keep narrator lines inline; they get regenerated every full-stitch. Fine because they're few, short, and don't drift much once phrasing is right.
  - **B (thorough):** Add a `narration_segments` table with the same shape, editable in the same UI. More work, more control.
  - Recommend **A** now, keep **B** on the table if narrator drift becomes an issue.

## Server functions (new, in `src/lib/audio-segments.functions.ts`)

- `regenerateSegment({ script_row_id })` — reads current transcript, copies existing `audio_path` → `previous_audio_path` (and text → `previous_transcript`), TTS the row, uploads to `segments/<row>.mp3`, marks fresh.
- `updateScriptRowText({ script_row_id, transcript })` — updates text; sets `audio_stale=true`. Does not call TTS.
- `revertSegment({ script_row_id })` — swap current ↔ previous, clear stale.
- `restitchExercise({ exercise_id })` — no ElevenLabs calls; downloads all per-row segment MP3s, generates narrator lines (inline, as today), concatenates with silence, uploads exercise MP3, refreshes signed URL. Errors clearly if any row is missing or stale.
- `generateSegmentsForExercise({ exercise_id })` — bulk-fill missing/stale segments. This replaces the "generate whole exercise" flow.

Existing `generateExerciseAudio` becomes a thin wrapper: `generateSegmentsForExercise` then `restitchExercise`. One-click first-time generation still works.

## UI

New route: `src/routes/_authenticated/assessments.$id.audio-editor.tsx` — tab or button from the existing assessment page.

- Grouped by Oefening, collapsible sections.
- Each row: speaker badge, editable textarea, `<audio>` for current, `<audio>` + text preview for previous, action buttons.
- Row status pill: **Fresh** / **Stale** (text edited since last TTS) / **Missing**.
- Toolbar per exercise: "Regenerate stale rows", "Restitch exercise" (disabled if any row missing/stale), plus a global "Restitch full paper" (existing `generateFullPaperAudio`, no changes needed).
- Optimistic UI: after regenerate, refresh signed URL and swap the audio element `src`.

## Cost profile

- First draft: same cost as today (all rows TTS'd once).
- Fix one line: 1 TTS call instead of 40. Stitching is free.
- Comparing takes: free (both files already exist).
- Full paper restitch: free.

## Migration (single call)

Add columns to `listening_scripts`:
- `audio_path text`
- `audio_generated_at timestamptz`
- `audio_stale boolean not null default true`
- `previous_transcript text`
- `previous_audio_path text`
- `previous_generated_at timestamptz`

No new tables, no new buckets, no policy changes (existing RLS on `listening_scripts` covers it; storage uses `supabaseAdmin` server-side as today).

## Order of build

1. Migration.
2. Server functions in `audio-segments.functions.ts` + refactor of `generateExerciseAudio`.
3. New route + UI.
4. Wire a link/button on the existing assessment page.

Effort: two focused build turns. First does migration + server layer, second does the UI so you can validate each half independently.

Approve and I'll start with the migration.