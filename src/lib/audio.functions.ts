// Server function: generate the stitched listening MP3 for one exercise.
//
// Per-row MP3s are persisted at:
//   exercise-audio/<assessment_id>/<exercise_id>/segments/<row_id>.mp3
// The previous take (for A/B compare / revert) at:
//   exercise-audio/<assessment_id>/<exercise_id>/segments/<row_id>.prev.mp3
//
// listening_scripts tracks audio_path, audio_generated_at, audio_stale,
// previous_transcript, previous_audio_path, previous_generated_at.
//
// This module also exports helpers (voice resolution, TTS, silence,
// stitching) reused by audio-segments.functions.ts for surgical regens.
//
// Pause patterns mirror the Cambridge 0548/02 SPECIMEN TRANSCRIPT.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { narratorVoiceId } from "@/lib/voices";
import { SILENCE_1S_MP3_BASE64 } from "@/lib/silence";

export const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days
// eleven_v3 is required because the voice cast IDs are v3 voices.
const TTS_MODEL = "eleven_v3";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const SILENCE_1S = base64ToBytes(SILENCE_1S_MP3_BASE64);

export type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
};

export type ResolvedVoice = {
  voiceId: string;
  settings: VoiceSettings;
  name: string;
  castId: string | null;
};

export type Segment =
  | { kind: "tts"; voice: ResolvedVoice; text: string }
  | { kind: "silence"; seconds: number }
  | { kind: "row"; rowId: string; voice: ResolvedVoice; text: string };

export function silence(seconds: number): Segment {
  return { kind: "silence", seconds: Math.max(0, Math.round(seconds)) };
}

export function silenceBytes(seconds: number): Uint8Array {
  if (seconds <= 0) return new Uint8Array();
  const out = new Uint8Array(SILENCE_1S.length * seconds);
  for (let i = 0; i < seconds; i++) out.set(SILENCE_1S, i * SILENCE_1S.length);
  return out;
}

export async function ttsSegment(
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

export function concat(bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) { out.set(b, off); off += b.length; }
  return out;
}

export function segmentPath(assessmentId: string, exerciseId: string, rowId: string, prev = false) {
  return `${assessmentId}/${exerciseId}/segments/${rowId}${prev ? ".prev" : ""}.mp3`;
}

// ------------- Voice resolution -------------

type ScriptRow = {
  id: string;
  sequence: number;
  speaker_label: string | null;
  transcript: string;
  item_index: number | null;
  audio_path: string | null;
  audio_generated_at: string | null;
  audio_stale: boolean;
  previous_transcript: string | null;
  previous_audio_path: string | null;
  previous_generated_at: string | null;
};

export type VoiceLibraryEntry = {
  voice_id: string;
  name: string;
  voice_settings: VoiceSettings;
};

export function makeVoiceResolver(
  library: Map<string, VoiceLibraryEntry>,
  voiceMap: Record<string, string | { id?: string; voice_id?: string }>,
  narrator: ResolvedVoice,
) {
  return (label: string | null): ResolvedVoice => {
    if (!label) return narrator;
    const raw = voiceMap[label];
    const ref = typeof raw === "string" ? raw : (raw?.id ?? raw?.voice_id ?? "");
    if (!ref) return narrator;
    if (UUID_RE.test(ref)) {
      const hit = library.get(ref);
      if (hit) return { voiceId: hit.voice_id, settings: hit.voice_settings, name: hit.name, castId: ref };
      return narrator;
    }
    return { voiceId: ref, settings: {}, name: label, castId: null };
  };
}

export function buildNarrator(): ResolvedVoice {
  return { voiceId: narratorVoiceId(), settings: {}, name: "Verteller", castId: null };
}

// ------------- Segment plan (row-aware) -------------

export function planExerciseSegments(
  ex: {
    number: number;
    rubric: string;
    voice_map: Record<string, unknown> | null;
  },
  script: ScriptRow[],
  questions: { number: number; stem: string }[],
  resolveLabel: (label: string | null) => ResolvedVoice,
  narrator: ResolvedVoice,
): Segment[] {
  const byItem = new Map<number, ScriptRow[]>();
  for (const row of script) {
    const idx = row.item_index ?? 0;
    const list = byItem.get(idx) ?? [];
    list.push(row);
    byItem.set(idx, list);
  }
  const itemKeys = [...byItem.keys()].sort((a, b) => a - b);

  const ttsRows = (rows: ScriptRow[]): Segment[] =>
    rows.map((r) => ({
      kind: "row" as const,
      rowId: r.id,
      voice: resolveLabel(r.speaker_label),
      text: r.transcript,
    }));

  const segs: Segment[] = [];
  const N = (text: string): Segment => ({ kind: "tts", voice: narrator, text });

  const exNum = ex.number;
  segs.push(N(`Oefening ${exNum}. ${ex.rubric}`));

  if (exNum === 1) {
    itemKeys.forEach((k, i) => {
      const q = questions[i];
      segs.push(N(`Vraag ${q?.number ?? i + 1}. ${q?.stem ?? ""}`));
      segs.push(silence(3));
      segs.push(...ttsRows(byItem.get(k)!));
      segs.push(silence(5));
      segs.push(...ttsRows(byItem.get(k)!));
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
      segs.push(...ttsRows(byItem.get(k)!));
      segs.push(silence(5));
      segs.push(...ttsRows(byItem.get(k)!));
      segs.push(silence(5));
    });
    segs.push(N(`Dit is die einde van Oefening ${exNum}. Gaan nou na Oefening ${exNum + 1}.`));
    segs.push(silence(5));
  } else if (exNum === 3) {
    const first = questions[0]?.number;
    const last = questions[questions.length - 1]?.number;
    segs.push(N(`Kyk nou na vrae ${first}–${last}.`));
    segs.push(silence(40));
    segs.push(...ttsRows(script));
    segs.push(silence(10));
    segs.push(N("Jy sal die praatjie nou nog 'n keer hoor."));
    segs.push(...ttsRows(script));
    segs.push(silence(10));
    segs.push(N(`Dit is die einde van Oefening ${exNum}. Gaan nou na Oefening ${exNum + 1}.`));
    segs.push(silence(5));
  } else if (exNum === 4) {
    segs.push(N("Lees nou stellings A–H."));
    segs.push(silence(30));
    const playSpeakers = () => {
      itemKeys.forEach((k, i) => {
        segs.push(N(`Spreker ${i + 1}.`));
        segs.push(...ttsRows(byItem.get(k)!));
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
    segs.push(...ttsRows(script));
    segs.push(N("Jy sal die onderhoud nou nog een keer hoor."));
    segs.push(...ttsRows(script));
    segs.push(silence(10));
    segs.push(N(`Hierdie is die einde van Oefening ${exNum}. Jy het nou 6 minute om jou antwoorde op die antwoordblad te skryf. Jy sal gewaarsku word wanneer daar nog net 1 minuut oor is.`));
    segs.push(silence(5 * 60));
    segs.push(N("Daar is nou 1 minuut oor."));
    segs.push(silence(60));
    segs.push(N("Dit is nou die einde van hierdie vraestel."));
  } else {
    segs.push(...ttsRows(script));
    segs.push(silence(5));
  }
  return segs;
}

// ------------- Exercise loader (shared) -------------

export async function loadExerciseContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  exerciseId: string,
) {
  const { data: ex, error: exErr } = await supabase
    .from("exercises")
    .select(
      "id,number,kind,rubric,intro,statements,assessment_id,voice_map,listening_scripts(id,sequence,speaker_label,transcript,item_index,audio_path,audio_generated_at,audio_stale,previous_transcript,previous_audio_path,previous_generated_at),questions(number,stem,speaker_index)",
    )
    .eq("id", exerciseId)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);
  if (!ex) throw new Error("Exercise not found or access denied");

  type ExRow = {
    id: string;
    number: number;
    rubric: string;
    assessment_id: string;
    voice_map: Record<string, unknown> | null;
    listening_scripts: ScriptRow[];
    questions: { number: number; stem: string; speaker_index: number | null }[];
  };
  const exTyped = ex as ExRow;
  const script = (exTyped.listening_scripts ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  if (script.length === 0) {
    throw new Error("No transcript rows on this exercise — generate the paper first.");
  }
  const questions = (exTyped.questions ?? []).slice().sort((a, b) => a.number - b.number);

  const { data: library } = await supabase
    .from("voice_cast")
    .select("id,voice_id,name,suitability,voice_settings")
    .eq("created_by", userId);
  const byId = new Map<string, VoiceLibraryEntry>();
  for (const row of (library ?? []) as Array<{
    id: string; voice_id: string; name: string; voice_settings: VoiceSettings;
  }>) {
    byId.set(row.id, {
      voice_id: row.voice_id,
      name: row.name,
      voice_settings: row.voice_settings ?? {},
    });
  }

  const narrator = buildNarrator();
  const voiceMap = (exTyped.voice_map ?? {}) as Record<string, string | { id?: string; voice_id?: string }>;
  const resolveLabel = makeVoiceResolver(byId, voiceMap, narrator);

  return { ex: exTyped, script, questions, narrator, resolveLabel };
}

// ------------- Per-row synthesis + persistence -------------

export async function synthesizeAndPersistRow(args: {
  row: ScriptRow;
  voice: ResolvedVoice;
  assessmentId: string;
  exerciseId: string;
}): Promise<Uint8Array> {
  const { row, voice, assessmentId, exerciseId } = args;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Snapshot current → previous when we already have a take.
  if (row.audio_path) {
    const { data: cur } = await supabaseAdmin.storage.from("exercise-audio").download(row.audio_path);
    if (cur) {
      const prevPath = segmentPath(assessmentId, exerciseId, row.id, true);
      const bytes = new Uint8Array(await cur.arrayBuffer());
      await supabaseAdmin.storage.from("exercise-audio").upload(prevPath, bytes, {
        contentType: "audio/mpeg",
        upsert: true,
      });
      await supabaseAdmin
        .from("listening_scripts")
        .update({
          previous_transcript: row.transcript,
          previous_audio_path: prevPath,
          previous_generated_at: row.audio_generated_at,
        })
        .eq("id", row.id);
    }
  }

  const bytes = await ttsSegment(voice, row.transcript.trim());
  const path = segmentPath(assessmentId, exerciseId, row.id, false);
  const { error: upErr } = await supabaseAdmin.storage
    .from("exercise-audio")
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (upErr) throw new Error(`Segment upload failed: ${upErr.message}`);

  const { error: updErr } = await supabaseAdmin
    .from("listening_scripts")
    .update({
      audio_path: path,
      audio_generated_at: new Date().toISOString(),
      audio_stale: false,
    })
    .eq("id", row.id);
  if (updErr) throw new Error(updErr.message);

  return bytes;
}

// ------------- Assemble MP3 from plan -------------

export async function assembleFromPlan(
  segs: Segment[],
  ctx: { assessmentId: string; exerciseId: string; rowById: Map<string, ScriptRow>; allowSynthesis: boolean },
): Promise<Uint8Array> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rowBytesCache = new Map<string, Uint8Array>();

  const bufs: Uint8Array[] = [];
  for (const seg of segs) {
    if (seg.kind === "silence") {
      bufs.push(silenceBytes(seg.seconds));
    } else if (seg.kind === "tts") {
      if (seg.text.trim()) {
        // eslint-disable-next-line no-await-in-loop
        bufs.push(await ttsSegment(seg.voice, seg.text.trim()));
      }
    } else {
      // row
      const cached = rowBytesCache.get(seg.rowId);
      if (cached) {
        bufs.push(cached);
        continue;
      }
      const row = ctx.rowById.get(seg.rowId);
      if (!row) throw new Error(`Missing row ${seg.rowId}`);
      if (row.audio_path && !row.audio_stale) {
        // eslint-disable-next-line no-await-in-loop
        const { data: blob, error } = await supabaseAdmin.storage
          .from("exercise-audio")
          .download(row.audio_path);
        if (error || !blob) throw new Error(`Missing segment audio for row ${row.id}: ${error?.message ?? ""}`);
        // eslint-disable-next-line no-await-in-loop
        const bytes = new Uint8Array(await blob.arrayBuffer());
        rowBytesCache.set(seg.rowId, bytes);
        bufs.push(bytes);
      } else {
        if (!ctx.allowSynthesis) {
          throw new Error(`Row ${row.id} has no fresh audio — regenerate before stitching.`);
        }
        // eslint-disable-next-line no-await-in-loop
        const bytes = await synthesizeAndPersistRow({
          row,
          voice: seg.voice,
          assessmentId: ctx.assessmentId,
          exerciseId: ctx.exerciseId,
        });
        rowBytesCache.set(seg.rowId, bytes);
        bufs.push(bytes);
      }
    }
  }
  return concat(bufs);
}

export async function uploadExerciseAudio(
  assessmentId: string,
  exerciseId: string,
  bytes: Uint8Array,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `${assessmentId}/${exerciseId}.mp3`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("exercise-audio")
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from("exercise-audio")
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !signed) throw new Error(`Signed URL failed: ${signErr?.message ?? "unknown"}`);

  const { error: updErr } = await supabaseAdmin
    .from("exercises")
    .update({ audio_url: signed.signedUrl })
    .eq("id", exerciseId);
  if (updErr) throw new Error(updErr.message);
  return signed.signedUrl;
}

// ------------- Public server functions -------------

export const generateExerciseAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { exercise_id: string }) =>
    z.object({ exercise_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { ex, script, questions, narrator, resolveLabel } = await loadExerciseContext(
      supabase as never,
      userId,
      data.exercise_id,
    );

    const segs = planExerciseSegments(ex, script, questions, resolveLabel, narrator);
    const rowById = new Map(script.map((r) => [r.id, r] as const));
    const stitched = await assembleFromPlan(segs, {
      assessmentId: ex.assessment_id,
      exerciseId: ex.id,
      rowById,
      allowSynthesis: true,
    });
    const audioUrl = await uploadExerciseAudio(ex.assessment_id, ex.id, stitched);

    return {
      exercise_id: ex.id,
      audio_url: audioUrl,
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
