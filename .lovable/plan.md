# Voice Cast workflow overhaul

Replace the current hardcoded "rotate within a bucket" voice picker with a curated cast you maintain yourself, and make the script generator cast-aware so it only writes roles your cast can voice.

## New workflow (end-to-end)

```text
Settings → Voice Library          New paper                      Editor
─────────────────────────         ─────────────────             ─────────────────
Paste voice IDs from              Pick which library            AI proposes cast
ElevenLabs, tag each              voices are "in play"          per exercise →
(gender, age, accent,             for this paper →              you can swap any
tags, role suitability)           saved on the paper            speaker → render
                                                                audio
```

## 1. Voice Library (global, per-user)

New page **/voices** (also linked from the workflow stepper and from /assessments/new).

- Add voice form: paste **ElevenLabs voice ID** (e.g. `MClEFoImJXBTgLwdLI5n`) + a display name. Optional "Preview" button that calls a tiny server fn to TTS a fixed Afrikaans sample line in that voice so you can confirm before saving.
- Per voice you set:
  - **Gender**: male / female / neutral
  - **Age band**: child / teen / young adult / adult / middle-aged / elderly
  - **Accent rating**: how natural the Afrikaans sounds (1–5) plus a free-text accent note ("slight Dutch", "Cape", "neutral SA")
  - **Persona tags** (free-text chips): "warm", "newsreader", "interviewer", "teen-casual", "authoritative", "gravelly", etc.
  - **Suitability flags** (checkboxes): Narrator · Ex1 short clip · Ex2 dialogue partner · Ex3 long monologue · Ex4 short speaker · Ex5 interviewer · Ex5 interviewee
  - **Voice settings overrides** (optional): stability / similarity / style / speed — saved with the voice so a voice that needs e.g. lower stability always uses it.
  - **Active** toggle (so you can retire a voice without deleting history).

## 2. Per-paper cast selection

On `/assessments/new`, above the existing exercise notes accordion, add a **"Voice cast for this paper"** panel:

- Lists every Active voice from your library with a checkbox + the metadata chips.
- Defaults to all Active voices ticked.
- The set of ticked voice IDs is saved on the assessment row.

## 3. Cast-aware script generation

`generatePaper` (in `src/lib/generate.functions.ts`) gets two changes:

- Before calling the model, it loads the paper's selected cast and builds a compact **"Available cast"** block injected into the system prompt — e.g.

  ```text
  AVAILABLE CAST (you MUST only write roles that match one of these):
  - V_adult_warm  : female, adult, warm, interviewer-friendly
  - M_elderly_1   : male, elderly, gravelly
  - V_teen_1      : female, teen, casual
  ...
  ```

- The model is instructed: every speaker label it emits in `listening_scripts` must reference one of these cast IDs (e.g. `V_adult_warm`). No free-form "Spreker 1".
- Validation gate: every distinct `speaker_label` in the returned script must exist in the cast; if any are missing, regenerate that exercise once, then surface a clear error.
- Per-exercise role budgets stay the same (Ex 1 narrator-only, Ex 4 needs 6 distinct speakers, etc.) and are enforced against suitability flags — e.g. Ex 4 will only pick voices flagged "Ex4 short speaker".

## 4. AI-proposed cast in the editor, with override

In `/assessments/$id`, replace the current "voice chips read-only" row inside each exercise's Klankopname panel with an **editable cast table**:

| Speaker in script | Proposed voice | Voice metadata | Swap |
|---|---|---|---|
| V_adult_warm | Sarah (female · adult · warm) | chips | dropdown of compatible cast voices |

- "Proposed" comes from the model's own label → so the AI casts automatically.
- "Swap" dropdown is filtered by the speaker's suitability tag (narrator-only roles only list voices flagged narrator-suitable, etc.), and you can hit **Preview** to hear a 5-second sample before committing.
- **Genereer klank** uses the final (proposed-or-overridden) mapping. **Herskep klank** keeps overrides unless you click **Reset cast**.

## 5. Audio generation changes

`src/lib/audio.functions.ts`:

- Replace `assignVoices()` (the rotate-within-bucket heuristic) with a direct lookup: read the per-exercise `voice_map` already persisted by the casting step → no inference.
- Apply each voice's saved `voice_settings` overrides instead of the current hardcoded `stability 0.55` etc.
- Narrator voice is whichever library voice is flagged "Narrator" (with a fallback if you haven't picked one).

## 6. Migration of existing data

- `src/lib/voices.ts` becomes a seed list (the current UK English IDs) inserted into your library once on first load so nothing breaks; you can edit / disable / replace any of them.
- Existing assessments keep working: if a paper has no cast selection, generation/audio falls back to "all Active voices".

## Technical sketch

**New tables**
- `voice_cast` — per-user library row per voice (voice_id, name, gender, age_band, accent_rating, accent_note, tags[], suitability jsonb, voice_settings jsonb, active, created_by). Standard RLS scoping to `auth.uid()`, full GRANT block.
- `assessment_voice_cast` — join: which voices are in play for which assessment (assessment_id, voice_cast_id). RLS via the parent assessment.

**Changed tables**
- `listening_scripts.speaker_label` keeps its text type but now stores cast role IDs the model emitted.
- `exercises.voice_map` already exists — repurposed to `{ speaker_label → voice_cast_id }`. Add `cast_overrides jsonb` for user-confirmed swaps if we want to keep "proposed vs final" separately (or just overwrite `voice_map` and drop the distinction — simpler, recommended).

**New / changed files**
- `src/routes/voices.tsx` — library CRUD page.
- `src/lib/voice-cast.functions.ts` — list/create/update/delete + `previewVoice` (TTS one short sample).
- `src/lib/generate.functions.ts` — inject cast block into prompt; validate speaker labels.
- `src/lib/audio.functions.ts` — drop `assignVoices`, read `voice_map` directly, apply per-voice settings.
- `src/routes/assessments.new.tsx` — cast picker panel + persist selection.
- `src/routes/assessments.$id.tsx` — editable cast table per exercise with Preview + Swap.
- `src/lib/voices.ts` — becomes a one-shot seed importer instead of a runtime roster.

## Out of scope for this slice

- Sharing voice libraries between users.
- Auto-rating Afrikaans pronunciation quality.
- Cloning voices via ElevenLabs API (you'd still browse ElevenLabs and paste IDs).
- Audio waveform / scrubbing UI changes.

Ready to build on approval. Suggested order: tables + library page → cast picker on /new → cast-aware generation → editable cast in editor → audio.functions rewrite → seed migration.
