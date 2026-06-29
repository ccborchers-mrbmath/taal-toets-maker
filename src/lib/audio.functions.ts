// Server function: generate the stitched listening MP3 for one exercise of a
// Cambridge IGCSE Afrikaans (0548) Paper 2 paper.
//
// - Uses ElevenLabs v3 (`eleven_v3`) which reproduces South African Afrikaans
//   well with UK English voices.
// - Picks voices per speaker label from src/lib/voices.ts (rotates within
//   gender/age bucket so two "M" speakers get different voices).
// - Builds the standard Cambridge segment order:
//     rubric -> read-aloud pause -> recording -> pause -> repeat -> pause.
// - Concatenates the per-segment MP3 buffers and uploads one MP3 per exercise
//   to the private `exercise-audio` bucket, then writes a signed URL back to
//   the exercise row.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assignVoices, narratorVoiceId, voiceName } from "@/lib/voices";

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days
const TTS_MODEL = "eleven_v3";

// Pause that ElevenLabs v3 honours inside a single TTS request.
function pause(seconds: number): string {
  return `<break time="${seconds.toFixed(1)}s" />`;
}

type Segment = { voiceId: string; text: string };

async function ttsSegment(voiceId: string, text: string): Promise<Uint8Array> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not connected to this project");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("ElevenLabs rate limit reached. Try again shortly.");
    if (res.status === 401) throw new Error("ElevenLabs API key rejected.");
    throw new Error(`TTS failed (${res.status}): ${body.slice(0, 240)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function concat(bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of bufs) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

// Pull the per-exercise "you will hear … you will hear it twice" rubric from
// the column we already stored at generation time.
function buildSegments(opts: {
  exerciseNumber: number;
  rubric: string;
  intro: string | null;
  statements: { letter: string; text: string }[] | null;
  script: { sequence: number; speaker_label: string | null; transcript: string }[];
  voiceMap: Record<string, string>;
}): Segment[] {
  const narrator = narratorVoiceId();
  const segs: Segment[] = [];

  // Header
  segs.push({
    voiceId: narrator,
    text: `Oefening ${opts.exerciseNumber}. ${opts.rubric} ${pause(1.5)}`,
  });

  // Exercise 4 statements need to be read out as part of the rubric pause.
  if (opts.statements && opts.statements.length > 0) {
    const list = opts.statements
      .map((s) => `${s.letter}. ${s.text}`)
      .join(` ${pause(0.4)} `);
    segs.push({
      voiceId: narrator,
      text: `Jy het nou tyd om die stellings te lees. ${pause(0.8)} ${list} ${pause(2.0)}`,
    });
  }

  if (opts.intro && opts.intro.trim()) {
    segs.push({ voiceId: narrator, text: `${opts.intro} ${pause(1.0)}` });
  }

  const playScript = () => {
    for (const row of opts.script) {
      const label = row.speaker_label?.trim() ?? "";
      const voiceId = (label && opts.voiceMap[label]) || narrator;
      segs.push({
        voiceId,
        text: `${pause(0.4)} ${row.transcript}`,
      });
    }
  };

  // First reading
  segs.push({ voiceId: narrator, text: `${pause(1.0)} Luister nou na die opname. ${pause(1.5)}` });
  playScript();

  // Pause + repeat
  segs.push({
    voiceId: narrator,
    text: `${pause(2.0)} Jy sal nou die opname weer hoor. ${pause(1.5)}`,
  });
  playScript();
  segs.push({ voiceId: narrator, text: `${pause(1.5)} Einde van Oefening ${opts.exerciseNumber}.` });

  return segs;
}

export const generateExerciseAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { exercise_id: string }) =>
    z.object({ exercise_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: ex, error: exErr } = await supabase
      .from("exercises")
      .select(
        "id,number,rubric,intro,statements,assessment_id,listening_scripts(sequence,speaker_label,transcript)",
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

    const labels = script
      .map((r) => r.speaker_label?.trim() ?? "")
      .filter((l) => l.length > 0);
    const voiceMap = assignVoices(labels);

    const statements = Array.isArray(ex.statements)
      ? (ex.statements as { letter: string; text: string }[])
      : null;

    const segments = buildSegments({
      exerciseNumber: ex.number,
      rubric: ex.rubric,
      intro: ex.intro,
      statements,
      script,
      voiceMap,
    });

    const audioBufs: Uint8Array[] = [];
    for (const seg of segments) {
      // sequential to stay polite to ElevenLabs rate limits
      // eslint-disable-next-line no-await-in-loop
      const bytes = await ttsSegment(seg.voiceId, seg.text);
      audioBufs.push(bytes);
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

    const voiceMapNamed: Record<string, { id: string; name: string }> = {};
    for (const [label, id] of Object.entries(voiceMap)) {
      voiceMapNamed[label] = { id, name: voiceName(id) };
    }

    const { error: updErr } = await supabaseAdmin
      .from("exercises")
      .update({ audio_url: signed.signedUrl, voice_map: voiceMapNamed })
      .eq("id", ex.id);
    if (updErr) throw new Error(updErr.message);

    return {
      exercise_id: ex.id,
      audio_url: signed.signedUrl,
      voice_map: voiceMapNamed,
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
