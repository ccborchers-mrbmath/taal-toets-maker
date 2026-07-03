// Server function: generate the stitched listening MP3 for one exercise.
//
// Pause patterns mirror the Cambridge 0548/02 SPECIMEN TRANSCRIPT exactly:
//
//   Ex1 (8 short clips):
//     "Oefening 1." + instructions
//     for each item:
//       R1: "Vraag N. <stem>"           PAUSE 3s
//       recording                        PAUSE 5s
//       recording (repeat)               PAUSE 5s
//     "Einde van Oefening 1. Gaan nou na Oefening 2."   PAUSE 5s
//
//   Ex2 (5 short dialogues, 2 Qs each):
//     "Oefening 2." + instructions       PAUSE 5s
//     for each pair:
//       "Jy gaan ... Kyk nou na vraag X en Y."   PAUSE 15s
//       recording                        PAUSE 5s
//       recording (repeat)               PAUSE 5s
//     ending                             PAUSE 5s
//
//   Ex3 (long monologue, 8 Qs):
//     "Oefening 3." + instructions + "Kyk nou vrae 19-26."   PAUSE 40s
//     recording                          PAUSE 10s
//     "Jy sal die praatjie nou nog ŉ keer hoor."
//     recording (repeat)                 PAUSE 10s
//     ending                             PAUSE 5s
//
//   Ex4 (6 short speakers, matching):
//     "Oefening 4." + instructions + "Lees nou stellings A-H."   PAUSE 30s
//     for each speaker:
//       "Spreker N"
//       recording                        PAUSE 10s
//     "Nou sal jy weer na die ses tieners luister."
//     for each speaker:
//       "Spreker N"
//       recording                        PAUSE 10s
//     ending                             PAUSE 5s
//
//   Ex5 (long interview, 8 Qs):
//     "Oefening 5." + instructions + "Kyk nou na vrae 33-40."   PAUSE 45s
//     recording
//     "Jy sal die onderhoud nou nog een keer hoor."
//     recording (repeat)                 PAUSE 10s
//     "Hierdie is die einde van oefening 5. Jy het nou 6 minute ..." PAUSE 5min
//     "Daar is nou 1 minuut oor."                                    PAUSE 1min
//     "Dit is nou die einde van hierdie vraestel."
//
// Long pauses are stitched as repeated 1-second silent MP3 frames so we
// neither pay for silent TTS nor exceed ElevenLabs `<break>` limits.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { narratorVoiceId } from "@/lib/voices";
import { SILENCE_1S_MP3_BASE64 } from "@/lib/silence";

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days
// eleven_v3 is required because the voice cast IDs are v3 voices.
// Note: v3 rejects previous_text/next_text stitching params.
const TTS_MODEL = "eleven_v3";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SILENCE_1S = Uint8Array.from(Buffer.from(SILENCE_1S_MP3_BASE64, "base64"));

type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
};

type ResolvedVoice = {
  voiceId: string;
  settings: VoiceSettings;
  name: string;
  castId: string | null;
};

type Segment =
  | { kind: "tts"; voice: ResolvedVoice; text: string }
  | { kind: "silence"; seconds: number };

function silence(seconds: number): Segment {
  return { kind: "silence", seconds: Math.max(0, Math.round(seconds)) };
}

function silenceBytes(seconds: number): Uint8Array {
  if (seconds <= 0) return new Uint8Array();
  const out = new Uint8Array(SILENCE_1S.length * seconds);
  for (let i = 0; i < seconds; i++) out.set(SILENCE_1S, i * SILENCE_1S.length);
  return out;
}

async function ttsSegment(
  voice: ResolvedVoice,
  text: string,
): Promise<Uint8Array> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not connected to this project");

  const body = {
    text,
    model_id: TTS_MODEL,
    language_code: "af",
    voice_settings: {
      stability: voice.settings.stability ?? 0.5,
      similarity_boost: voice.settings.similarity_boost ?? 0.75,
      ...(voice.settings.speed ? { speed: voice.settings.speed } : {}),
    },
  };


  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("ElevenLabs rate limit reached. Try again shortly.");
    if (res.status === 401) throw new Error("ElevenLabs API key rejected.");
    throw new Error(`TTS failed (${res.status}): ${txt.slice(0, 240)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function concat(bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) { out.set(b, off); off += b.length; }
  return out;
}

export const generateExerciseAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { exercise_id: string }) =>
    z.object({ exercise_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ex, error: exErr } = await supabase
      .from("exercises")
      .select(
        "id,number,kind,rubric,intro,statements,assessment_id,voice_map,listening_scripts(sequence,speaker_label,transcript,item_index),questions(number,stem,speaker_index)",
      )
      .eq("id", data.exercise_id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!ex) throw new Error("Exercise not found or access denied");

    type ScriptRow = { sequence: number; speaker_label: string | null; transcript: string; item_index: number | null };
    const script: ScriptRow[] = (ex.listening_scripts ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    if (script.length === 0) {
      throw new Error("No transcript rows on this exercise — generate the paper first.");
    }
    const questions = (ex.questions ?? [])
      .slice()
      .sort((a, b) => a.number - b.number);

    // ---- Voice library ----
    const { data: library } = await supabase
      .from("voice_cast")
      .select("id,voice_id,name,suitability,voice_settings")
      .eq("created_by", userId);
    const byId = new Map<string, { voice_id: string; name: string; voice_settings: VoiceSettings; suitability: Record<string, boolean | undefined> }>();
    for (const row of library ?? []) {
      byId.set(row.id as string, {
        voice_id: row.voice_id as string,
        name: row.name as string,
        voice_settings: (row.voice_settings as VoiceSettings) ?? {},
        suitability: (row.suitability as Record<string, boolean | undefined>) ?? {},
      });
    }

    // Narrator is ALWAYS the hardcoded designated narrator voice ID.
    // Cast-voice narrator flags are intentionally ignored so pronunciation
    // stays consistent across every generated paper.
    const narrator: ResolvedVoice = {
      voiceId: narratorVoiceId(),
      settings: {},
      name: "Verteller",
      castId: null,
    };

    const voiceMap = (ex.voice_map ?? {}) as Record<string, string | { id?: string; voice_id?: string }>;
    const resolveLabel = (label: string): ResolvedVoice => {
      const raw = voiceMap[label];
      const ref = typeof raw === "string" ? raw : (raw?.id ?? raw?.voice_id ?? "");
      if (!ref) return narrator;
      if (UUID_RE.test(ref)) {
        const hit = byId.get(ref);
        if (hit) return { voiceId: hit.voice_id, settings: hit.voice_settings, name: hit.name, castId: ref };
        return narrator;
      }
      return { voiceId: ref, settings: {}, name: label, castId: null };
    };

    // Group transcript turns by item_index (null → single bucket 0).
    const byItem = new Map<number, ScriptRow[]>();
    for (const row of script) {
      const idx = row.item_index ?? 0;
      const list = byItem.get(idx) ?? [];
      list.push(row);
      byItem.set(idx, list);
    }
    const itemKeys = [...byItem.keys()].sort((a, b) => a - b);

    const ttsItem = (rows: ScriptRow[]): Segment[] =>
      rows.map((r) => ({
        kind: "tts" as const,
        voice: r.speaker_label ? resolveLabel(r.speaker_label) : narrator,
        text: r.transcript,
      }));

    const segs: Segment[] = [];
    const N = (text: string): Segment => ({ kind: "tts", voice: narrator, text });

    const exNum = ex.number;

    // Always lead with the exercise rubric.
    segs.push(N(`Oefening ${exNum}. ${ex.rubric}`));

    if (exNum === 1) {
      // 8 short clips, no shared intro pause beyond rubric.
      itemKeys.forEach((k, i) => {
        const q = questions[i];
        segs.push(N(`Vraag ${q?.number ?? i + 1}. ${q?.stem ?? ""}`));
        segs.push(silence(3));
        segs.push(...ttsItem(byItem.get(k)!));
        segs.push(silence(5));
        segs.push(...ttsItem(byItem.get(k)!));
        segs.push(silence(5));
      });
      segs.push(N(`Hierdie is nou die einde van Oefening ${exNum}. Gaan nou na Oefening ${exNum + 1}.`));
      segs.push(silence(5));
    } else if (exNum === 2) {
      segs.push(silence(5));
      itemKeys.forEach((k, i) => {
        const pair = questions.filter((_, idx) => idx === i * 2 || idx === i * 2 + 1);
        const qNums = pair.map((q) => q.number).join(" en ");
        segs.push(N(`Kyk nou na vraag ${qNums}.`));
        segs.push(silence(15));
        segs.push(...ttsItem(byItem.get(k)!));
        segs.push(silence(5));
        segs.push(...ttsItem(byItem.get(k)!));
        segs.push(silence(5));
      });
      segs.push(N(`Dit is die einde van Oefening ${exNum}. Gaan nou na Oefening ${exNum + 1}.`));
      segs.push(silence(5));
    } else if (exNum === 3) {
      const first = questions[0]?.number;
      const last = questions[questions.length - 1]?.number;
      segs.push(N(`Kyk nou na vrae ${first}–${last}.`));
      segs.push(silence(40));
      segs.push(...ttsItem(script));
      segs.push(silence(10));
      segs.push(N("Jy sal die praatjie nou nog 'n keer hoor."));
      segs.push(...ttsItem(script));
      segs.push(silence(10));
      segs.push(N(`Dit is die einde van Oefening ${exNum}. Gaan nou na Oefening ${exNum + 1}.`));
      segs.push(silence(5));
    } else if (exNum === 4) {
      segs.push(N("Lees nou stellings A–H."));
      segs.push(silence(30));
      const playSpeakers = () => {
        itemKeys.forEach((k, i) => {
          segs.push(N(`Spreker ${i + 1}.`));
          segs.push(...ttsItem(byItem.get(k)!));
          segs.push(silence(10));
        });
      };
      playSpeakers();
      segs.push(N("Nou sal jy weer na die ses sprekers luister."));
      playSpeakers();
      segs.push(N(`Dit is die einde van Oefening ${exNum}. Gaan nou na Oefening ${exNum + 1}.`));
      segs.push(silence(5));
    } else if (exNum === 5) {
      const first = questions[0]?.number;
      const last = questions[questions.length - 1]?.number;
      segs.push(N(`Kyk nou na vrae ${first}–${last}.`));
      segs.push(silence(45));
      segs.push(...ttsItem(script));
      segs.push(N("Jy sal die onderhoud nou nog een keer hoor."));
      segs.push(...ttsItem(script));
      segs.push(silence(10));
      segs.push(N(`Hierdie is die einde van Oefening ${exNum}. Jy het nou 6 minute om jou antwoorde op die antwoordblad te skryf. Jy sal gewaarsku word wanneer daar nog net 1 minuut oor is.`));
      segs.push(silence(5 * 60));
      segs.push(N("Daar is nou 1 minuut oor."));
      segs.push(silence(60));
      segs.push(N("Dit is nou die einde van hierdie vraestel."));
    } else {
      // Fallback: replay once with 5s between.
      segs.push(...ttsItem(script));
      segs.push(silence(5));
    }

    // ---- Synthesise ----
    const audioBufs: Uint8Array[] = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.kind === "silence") {
        audioBufs.push(silenceBytes(seg.seconds));
      } else if (seg.text.trim()) {
        // eslint-disable-next-line no-await-in-loop
        audioBufs.push(await ttsSegment(seg.voice, seg.text.trim()));
      }
    }
    const stitched = concat(audioBufs);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${ex.assessment_id}/${ex.id}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("exercise-audio")
      .upload(path, stitched, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("exercise-audio")
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr || !signed) throw new Error(`Signed URL failed: ${signErr?.message ?? "unknown"}`);

    const { error: updErr } = await supabaseAdmin
      .from("exercises")
      .update({ audio_url: signed.signedUrl })
      .eq("id", ex.id);
    if (updErr) throw new Error(updErr.message);

    return {
      exercise_id: ex.id,
      audio_url: signed.signedUrl,
      voice_map: voiceMap,
      bytes: stitched.length,
    };
  });

// Refresh a signed URL for already-generated audio without re-synthesising.
export const refreshExerciseAudioUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { exercise_id: string }) =>
    z.object({ exercise_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ex, error } = await supabase
      .from("exercises")
      .select("id,assessment_id")
      .eq("id", data.exercise_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ex) throw new Error("Exercise not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${ex.assessment_id}/${ex.id}.mp3`;
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("exercise-audio")
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Signed URL failed");
    await supabaseAdmin
      .from("exercises")
      .update({ audio_url: signed.signedUrl })
      .eq("id", ex.id);
    return { audio_url: signed.signedUrl };
  });
