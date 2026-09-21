# Slow down the narrator voice to 95% speed

## What changes

In `src/lib/audio.functions.ts`, `buildNarrator()` currently returns the narrator with empty voice settings (default speed 1.0). Change it to pass `speed: 0.95`:

```ts
export function buildNarrator(): ResolvedVoice {
  return { voiceId: narratorVoiceId(), settings: { speed: 0.95 }, name: "Verteller", castId: null };
}
```

`ttsSegment()` already honours `voice.settings.speed` and forwards it to ElevenLabs, so no other code changes are needed. All dialogue/speaker voices are resolved separately via `makeVoiceResolver` and are untouched.

## Scope / impact

- The narrator lines ("Oefening 1…", "Kyk nou na vraag…", "Jy sal die praatjie nou nog 'n keer hoor.", etc.) are `tts`-kind segments synthesized fresh at stitch time — so the slower pace applies the next time an exercise's audio is **generated or re-stitched**.
- Speaker dialogue rows keep their existing per-row cached audio and current speed.
- Existing already-generated exercise MP3s will NOT change on their own. To hear the slower narrator on a paper that's already generated, re-stitch/regenerate the exercise audio from the audio editor (narrator lines are cheap — only the narrator sentences are re-synthesized; cached dialogue is reused).

## Notes

- ElevenLabs `speed` accepts 0.7–1.2, so 0.95 is valid.
- Silences between segments stay as-is; only the narrator's speech rate drops ~5%.

## Verification

- Regenerate (or restitch) audio for one exercise and confirm the narrator sentences are noticeably slower while dialogue is unchanged.
