-- Fix "swap back" restoring the wrong wording: listening_scripts had no
-- field tracking which transcript actually produced the currently-stored
-- audio_path. updateScriptRowText overwrites `transcript` immediately on
-- edit, before regeneration runs, so by the time synthesizeAndPersistRow
-- snapshots current -> previous, `transcript` already holds the NEW text —
-- there's no way to recover the OLD wording that matches the archived MP3.
--
-- audio_transcript always holds "the transcript last successfully
-- synthesized into audio_path", independent of pending text edits.
ALTER TABLE public.listening_scripts
  ADD COLUMN audio_transcript TEXT;

-- Backfill: for existing rows, assume the current transcript matches the
-- current audio (true for anything not already flagged stale from a prior
-- unresolved edit — those legacy rows keep today's behavior, this only
-- fixes the bug going forward).
UPDATE public.listening_scripts
SET audio_transcript = transcript
WHERE audio_path IS NOT NULL;
