// Server function: generate the stitched listening MP3 for one exercise.
//
// Voice resolution:
//   1. Each speaker label in the script is mapped via `exercises.voice_map`
//      to a `voice_cast.id` (the user's library) when available.
//   2. The narrator voice is whichever cast voice is flagged
//      `suitability.narrator = true`; falls back to the first active voice.
//   3. Per-voice ElevenLabs `voice_settings` overrides are applied when set.
//
// Backwards compat: if a `voice_map` entry isn't a UUID we treat it as a
// raw ElevenLabs voice_id.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { narratorVoiceId } from "@/lib/voices";

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days
const TTS_MODEL = "eleven_v3";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
};

type ResolvedVoice = {
  voiceId: string; // ElevenLabs voice id
  settings: VoiceSettings;
  name: string;
  castId: string | null;
};

function pause(seconds: number): string {
  return `<break time="${seconds.toFixed(1)}s" />`;
}

async function ttsSegment(voice: ResolvedVoice, text: string): Promise<Uint8Array> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not connected to this project");

  const body = {
    text,
    model_id: TTS_MODEL,
    voice_settings: {
      stability: voice.settings.stability ?? 0.55,
      similarity_boost: voice.settings.similarity_boost ?? 0.8,
      style: voice.settings.style ?? 0.25,
      use_speaker_boost: true,
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
        "id,number,rubric,intro,statements,assessment_id,voice_map,listening_scripts(sequence,speaker_label,transcript)",
      )
      .eq("id", data.exercise_id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!ex) throw new Error("Exercise not found or access denied");

    const script = (ex.listening_scripts ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    if (script.length === 0) {
      throw new Error("No transcript rows on this exercise — generate the paper first.");
    }

    // ---- Load the user's full voice library so we can resolve cast IDs ----
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

    // Narrator: prefer a cast voice flagged narrator
    const narratorRow = [...byId.values()].find((v) => v.suitability.narrator);
    const narrator: ResolvedVoice = narratorRow
      ? { voiceId: narratorRow.voice_id, settings: narratorRow.voice_settings, name: narratorRow.name, castId: null }
      : { voiceId: narratorVoiceId(), settings: {}, name: "Verteller", castId: null };

    // Resolve per-label voices from voice_map.
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
      // legacy raw ElevenLabs id
      return { voiceId: ref, settings: {}, name: label, castId: null };
    };

    type Segment = { voice: ResolvedVoice; text: string };
    const segs: Segment[] = [];

    segs.push({ voice: narrator, text: `Oefening ${ex.number}. ${ex.rubric} ${pause(1.5)}` });

    const statements = Array.isArray(ex.statements)
      ? (ex.statements as { letter: string; text: string }[])
      : null;
    if (statements && statements.length > 0) {
      const list = statements.map((s) => `${s.letter}. ${s.text}`).join(` ${pause(0.4)} `);
      segs.push({
        voice: narrator,
        text: `Jy het nou tyd om die stellings te lees. ${pause(0.8)} ${list} ${pause(2.0)}`,
      });
    }

    if (ex.intro && ex.intro.trim()) {
      segs.push({ voice: narrator, text: `${ex.intro} ${pause(1.0)}` });
    }

    const playScript = () => {
      for (const row of script) {
        const label = row.speaker_label?.trim() ?? "";
        const voice = label ? resolveLabel(label) : narrator;
        segs.push({ voice, text: `${pause(0.4)} ${row.transcript}` });
      }
    };

    segs.push({ voice: narrator, text: `${pause(1.0)} Luister nou na die opname. ${pause(1.5)}` });
    playScript();
    segs.push({ voice: narrator, text: `${pause(2.0)} Jy sal nou die opname weer hoor. ${pause(1.5)}` });
    playScript();
    segs.push({ voice: narrator, text: `${pause(1.5)} Einde van Oefening ${ex.number}.` });

    const audioBufs: Uint8Array[] = [];
    for (const seg of segs) {
      // eslint-disable-next-line no-await-in-loop
      audioBufs.push(await ttsSegment(seg.voice, seg.text));
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
