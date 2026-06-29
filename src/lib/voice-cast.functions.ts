// Server functions for the user's personal voice library ("cast"), backed by
// the public.voice_cast and public.assessment_voice_cast tables.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { VOICES, type VoiceBucket } from "@/lib/voices";

export type Gender = "male" | "female" | "neutral";
export type AgeBand =
  | "child"
  | "teen"
  | "young_adult"
  | "adult"
  | "middle_aged"
  | "elderly";

export type Suitability = {
  narrator?: boolean;
  ex1?: boolean;
  ex2?: boolean;
  ex3?: boolean;
  ex4?: boolean;
  ex5_interviewer?: boolean;
  ex5_interviewee?: boolean;
};

export type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
};

export type CastVoice = {
  id: string;
  voice_id: string;
  name: string;
  gender: Gender;
  age_band: AgeBand;
  accent_rating: number;
  accent_note: string | null;
  tags: string[];
  suitability: Suitability;
  voice_settings: VoiceSettings;
  active: boolean;
};

const VoiceInput = z.object({
  id: z.string().uuid().optional(),
  voice_id: z.string().min(8).max(64),
  name: z.string().min(1).max(40),
  gender: z.enum(["male", "female", "neutral"]),
  age_band: z.enum(["child", "teen", "young_adult", "adult", "middle_aged", "elderly"]),
  accent_rating: z.number().int().min(1).max(5),
  accent_note: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(24)).max(20).default([]),
  suitability: z
    .object({
      narrator: z.boolean().optional(),
      ex1: z.boolean().optional(),
      ex2: z.boolean().optional(),
      ex3: z.boolean().optional(),
      ex4: z.boolean().optional(),
      ex5_interviewer: z.boolean().optional(),
      ex5_interviewee: z.boolean().optional(),
    })
    .default({}),
  voice_settings: z
    .object({
      stability: z.number().min(0).max(1).optional(),
      similarity_boost: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional(),
      speed: z.number().min(0.7).max(1.2).optional(),
    })
    .default({}),
  active: z.boolean().default(true),
});

function seedSuitabilityFor(bucket: VoiceBucket): Suitability {
  switch (bucket) {
    case "narrator":
      return { narrator: true, ex5_interviewer: true };
    case "adult_male":
    case "adult_female":
      return { ex2: true, ex3: true, ex4: true, ex5_interviewer: true, ex5_interviewee: true };
    case "young_male":
    case "young_female":
      return { ex1: true, ex2: true, ex4: true };
    case "elderly_male":
    case "elderly_female":
      return { ex2: true, ex3: true, ex4: true, ex5_interviewee: true };
  }
}

function seedGender(bucket: VoiceBucket): Gender {
  if (bucket.endsWith("_male")) return "male";
  if (bucket.endsWith("_female")) return "female";
  return "neutral";
}
function seedAge(bucket: VoiceBucket): AgeBand {
  if (bucket === "narrator") return "adult";
  if (bucket.startsWith("young_")) return "teen";
  if (bucket.startsWith("elderly_")) return "elderly";
  return "adult";
}

export const listMyVoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CastVoice[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("voice_cast")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    // Seed on first load with the legacy roster.
    if (!data || data.length === 0) {
      const rows = VOICES.map((v) => ({
        created_by: userId,
        voice_id: v.id,
        name: v.name,
        gender: seedGender(v.bucket),
        age_band: seedAge(v.bucket),
        accent_rating: 3,
        accent_note: "UK English voice — moderate Afrikaans pronunciation",
        tags: [v.bucket.replace("_", " ")],
        suitability: seedSuitabilityFor(v.bucket),
        voice_settings: {},
        active: true,
      }));
      const { data: inserted, error: insErr } = await supabase
        .from("voice_cast")
        .insert(rows)
        .select("*");
      if (insErr) throw new Error(insErr.message);
      return (inserted ?? []) as unknown as CastVoice[];
    }
    return data as unknown as CastVoice[];
  });

export const saveVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VoiceInput.parse(d))
  .handler(async ({ data, context }): Promise<CastVoice> => {
    const { supabase, userId } = context;
    const payload = {
      created_by: userId,
      voice_id: data.voice_id.trim(),
      name: data.name.trim(),
      gender: data.gender,
      age_band: data.age_band,
      accent_rating: data.accent_rating,
      accent_note: data.accent_note ?? null,
      tags: data.tags ?? [],
      suitability: data.suitability ?? {},
      voice_settings: data.voice_settings ?? {},
      active: data.active,
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("voice_cast")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .maybeSingle();
      if (error || !row) throw new Error(error?.message ?? "update failed");
      return row as unknown as CastVoice;
    }
    const { data: row, error } = await supabase
      .from("voice_cast")
      .insert(payload)
      .select("*")
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "insert failed");
    return row as unknown as CastVoice;
  });

export const deleteVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("voice_cast").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Set which voices are in play for a given assessment.
export const setAssessmentCast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      assessment_id: z.string().uuid(),
      voice_cast_ids: z.array(z.string().uuid()).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Verify the assessment is mine (RLS will enforce too)
    const { data: a, error: aErr } = await supabase
      .from("assessments")
      .select("id")
      .eq("id", data.assessment_id)
      .maybeSingle();
    if (aErr || !a) throw new Error("Assessment not found");

    await supabase.from("assessment_voice_cast").delete().eq("assessment_id", data.assessment_id);
    if (data.voice_cast_ids.length === 0) return { ok: true, count: 0 };
    const rows = data.voice_cast_ids.map((vid) => ({
      assessment_id: data.assessment_id,
      voice_cast_id: vid,
    }));
    const { error } = await supabase.from("assessment_voice_cast").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

export const getAssessmentCast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ assessment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CastVoice[]> => {
    const { data: rows, error } = await context.supabase
      .from("assessment_voice_cast")
      .select("voice_cast(*)")
      .eq("assessment_id", data.assessment_id);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as { voice_cast: CastVoice }[])
      .map((r) => r.voice_cast)
      .filter(Boolean);
  });

// Override one speaker label → voice_cast_id mapping on an exercise.
export const setExerciseVoiceOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      exercise_id: z.string().uuid(),
      label: z.string().min(1),
      voice_cast_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ex, error } = await supabase
      .from("exercises")
      .select("id,voice_map")
      .eq("id", data.exercise_id)
      .maybeSingle();
    if (error || !ex) throw new Error("Exercise not found");
    const map = (ex.voice_map ?? {}) as Record<string, unknown>;
    map[data.label] = data.voice_cast_id;
    const { error: upErr } = await supabase
      .from("exercises")
      .update({ voice_map: map as never, audio_url: null })
      .eq("id", data.exercise_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

// Preview a voice: return base64 MP3 of a short Afrikaans sample.
export const previewVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      voice_id: z.string().min(8),
      sample: z.string().max(280).optional(),
      voice_settings: z
        .object({
          stability: z.number().min(0).max(1).optional(),
          similarity_boost: z.number().min(0).max(1).optional(),
          style: z.number().min(0).max(1).optional(),
          speed: z.number().min(0.7).max(1.2).optional(),
        })
        .optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ElevenLabs is not connected to this project");
    const sample =
      data.sample ??
      "Goeiedag almal, en welkom by die luistereksamen. Vandag gaan ons na 'n paar kort gesprekke luister oor die alledaagse lewe in Suid-Afrika.";
    const settings = {
      stability: data.voice_settings?.stability ?? 0.55,
      similarity_boost: data.voice_settings?.similarity_boost ?? 0.8,
      style: data.voice_settings?.style ?? 0.25,
      use_speaker_boost: true,
      ...(data.voice_settings?.speed ? { speed: data.voice_settings.speed } : {}),
    };
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${data.voice_id}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sample,
          model_id: "eleven_v3",
          voice_settings: settings,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Preview failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { mime: "audio/mpeg", base64: buf.toString("base64") };
  });
