# Plan: Afrikaans phrasing rules + per-segment audio editor

Two independent improvements. Both are feasible and reinforce each other.

---

## Part 1 — Make "Afrikaans, not Dutch" a working principle

The generation prompt (`src/lib/generate.functions.ts`) is where the model writes the transcript. Right now it likely just says "write in Afrikaans". We add an explicit *stylistic guardrail* that pushes vocabulary and phrasing away from words shared with Dutch.

### What we add to the generation system prompt

A short "Afrikaans phrasing rules" block, e.g.:

- Prefer distinctly Afrikaans lexical choices over Dutch-shared forms:
  - "lekker" / "gaaf" over "gelukkig" where natural
  - "hoe gaan dit" over "hoe was jou dag"
  - "baie" over "veel"
  - "sommer", "mos", "dan nou" — natural Afrikaans discourse particles
  - "sover" / "tot dusver" — prefer "sover"
  - "praatjie", "gesels", "kuier", "lekker" — everyday Afrikaans register
- Avoid Dutch-leaning constructions:
  - "Hoe was jou dag tot dusver" → "Hoe gaan dit met jou dag sover"
  - "Gelukkige verjaarsdag" → "Veels geluk met jou verjaarsdag" or "Lekker verjaarsdag"
  - "Het je …" style word order → use Afrikaans "Het jy …"
- Short greetings and openers matter most (TTS drifts to Dutch on short lines) — always use unmistakably Afrikaans forms in first sentences and standalone one-liners.
- Use Afrikaans double-negation ("nie … nie") naturally.
- Contract where an Afrikaans speaker would: "'n", "jy't", "ek's".

This costs no runtime credits — it just biases the LLM output so the text handed to ElevenLabs is *already* the "Lekker verjaarsdag …" version rather than the "Gelukkige verjaarsdag …" version.

### Files touched
- `src/lib/generate.functions.ts` — add the phrasing-rules block to the transcript-writing prompt.

No schema or API changes.

---

## Part 2 — Per-segment audio editor ("surgical correction" page)

You are correct about how it works today: `generateExerciseAudio` walks the exercise's `listening_scripts` rows in `sequence` order, calls ElevenLabs once per row (`ttsSegment`), and stitches the resulting MP3 bytes together with silence frames. Each script row is already an independent TTS call. That means per-row regeneration is architecturally natural — we just aren't persisting the intermediate MP3s.

### The idea, made concrete

New page: `/assessments/$id/audio-editor` (or a tab on the assessment page). For each `Oefening`, a table:

| # | Speaker | Transcript (editable) | Audio snippet | Actions |
|---|---------|------------------------|---------------|---------|
| 1 | Verteller | "Oefening 1. Luister …" | ▶ 0:04 | Regenerate • Save text |
| 2 | Emma      | "Lekker verjaarsdag …"  | ▶ 0:03 | Regenerate • Save text |
| … | …         | …                       | …             | … |

Workflow:
1. User clicks **Generate draft** for an exercise — same as today, but each per-row MP3 is stored individually.
2. User plays through, spots "row 7 sounds Dutch".
3. User edits row 7's transcript inline, clicks **Regenerate this line**. Only that one ElevenLabs call is made.
4. User clicks **Restitch exercise** — concatenates the stored per-row MP3s + narrator lines + silences, no new TTS calls, near-zero cost, produces the final exercise MP3.
5. Same **Restitch full paper** step already exists (`full-audio.functions.ts`).

### Cost model
- Today: fix one word → regenerate whole exercise → pay for every line again.
- With this: fix one word → regenerate one line → pay for one line. A 40-line exercise becomes ~1/40 the cost per correction.
- Restitching is free (byte concatenation, already how we build both exercise and full-paper MP3s).

### What changes technically

**Storage.** New Supabase Storage folder `exercise-audio/<assessment_id>/<exercise_id>/segments/<script_row_id>.mp3`. One object per `listening_scripts` row. Optional column on `listening_scripts`: `audio_path text`, `audio_generated_at timestamptz`, `audio_stale boolean` (true when transcript edited after audio generated).

**New server functions** (in `src/lib/audio.functions.ts` or a new `audio-segments.functions.ts`):
- `generateSegmentAudio({ script_row_id })` — TTS one row, upload MP3 to `segments/`, mark row fresh.
- `regenerateExerciseFromSegments({ exercise_id })` — read all segment MP3s + narrator lines (narrator lines can be cached too, keyed by hash of text) + silence, stitch, upload as the exercise MP3, refresh signed URL. No ElevenLabs call needed if all segments are fresh.
- `updateScriptRowText({ script_row_id, transcript })` — updates text, marks `audio_stale=true`.

Existing `generateExerciseAudio` is refactored to loop through rows via `generateSegmentAudio` (skip rows whose audio is already fresh), then call the stitch step. This preserves the current one-click flow while making it incremental.

**Narrator lines** (rubrics, "Vraag N", "Spreker N", endings) are generated inline today. To make them also editable and cacheable, we store them as additional rows keyed by a synthetic `kind` (e.g. `narration`) with the same segment file layout. Alternatively, cache narrator TTS by `hash(text + voiceId)` in a small `tts_cache` table/bucket so identical narrator phrases across regens cost nothing.

**New route** `src/routes/_authenticated/assessments.$id.audio-editor.tsx`:
- Fetches exercises + `listening_scripts` + segment audio signed URLs.
- Table per exercise, inline `<textarea>` per row, `<audio>` element per row.
- Buttons: "Regenerate line", "Regenerate stale lines only", "Restitch exercise", "Restitch full paper".
- Visual indicator on rows where `audio_stale=true` or audio missing.

**Migration.** Add `audio_path`, `audio_generated_at`, `audio_stale` to `listening_scripts`. Add `paper-audio` and `exercise-audio` bucket entries already exist; add a `segments/` prefix convention (no new bucket needed).

### Effort estimate
- Part 1 (phrasing prompt): ~15 min, low risk.
- Part 2 (segment editor): ~1–2 build-mode iterations. Bulk of work is the new route UI and the migration; the server-side changes are a straightforward refactor of the existing loop in `generateExerciseAudio`.

### Worth it?
Yes — given you're currently burning credits on full-exercise regens to fix single-line pronunciations, this pays for itself within a couple of papers. Part 1 further reduces how often Part 2 is needed.

---

## Order of work
1. **Part 1 first** (cheap, immediate win, reduces how often you need Part 2).
2. Regenerate one paper, listen, confirm the drift is much reduced.
3. **Part 2** if you still want surgical control (recommended — even with better phrasing you'll want single-line fixes sometimes).

Approve and I'll implement Part 1 in the first build turn, then Part 2 as a follow-up so you can validate each independently.