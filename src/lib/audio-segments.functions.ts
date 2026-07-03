// Surgical per-segment audio operations.
//
// - regenerateSegment: TTS one script row (with snapshot to `previous`)
// - updateScriptRowText: edit transcript, mark stale
// - revertSegment: swap current ↔ previous take
// - restitchExercise: re-assemble exercise MP3 from stored segments (no TTS)
// - listExerciseSegments: fetch rows + signed URLs for current + previous audio
// - generateStaleSegments: bulk-fill missing/stale rows

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  SIGNED_URL_TTL,
  assembleFromPlan,
  loadExerciseContext,
  planExerciseSegments,
  synthesizeAndPersistRow,
  uploadExerciseAudio,
} from "@/lib/audio.functions";

export const listExerciseSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { exercise_id: string }) =>
    z.object({ exercise_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("listening_scripts")
      .select(
        "id,sequence,speaker_label,transcript,item_index,audio_path,audio_generated_at,audio_stale,previous_transcript,previous_audio_path,previous_generated_at,exercises!inner(assessment_id)",
      )
      .eq("exercise_id", data.exercise_id)
      .order("sequence");
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: Array<{
      id: string;
      sequence: number;
      speaker_label: string | null;
      transcript: string;
      item_index: number | null;
      audio_stale: boolean;
      audio_generated_at: string | null;
      audio_url: string | null;
      previous_transcript: string | null;
      previous_audio_url: string | null;
      previous_generated_at: string | null;
    }> = [];

    for (const r of (rows ?? []) as Array<{
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
    }>) {
      let audio_url: string | null = null;
      let previous_audio_url: string | null = null;
      if (r.audio_path) {
        // eslint-disable-next-line no-await-in-loop
        const { data: s } = await supabaseAdmin.storage
          .from("exercise-audio")
          .createSignedUrl(r.audio_path, SIGNED_URL_TTL);
        audio_url = s?.signedUrl ?? null;
      }
      if (r.previous_audio_path) {
        // eslint-disable-next-line no-await-in-loop
        const { data: s } = await supabaseAdmin.storage
          .from("exercise-audio")
          .createSignedUrl(r.previous_audio_path, SIGNED_URL_TTL);
        previous_audio_url = s?.signedUrl ?? null;
      }
      out.push({
        id: r.id,
        sequence: r.sequence,
        speaker_label: r.speaker_label,
        transcript: r.transcript,
        item_index: r.item_index,
        audio_stale: r.audio_stale,
        audio_generated_at: r.audio_generated_at,
        audio_url,
        previous_transcript: r.previous_transcript,
        previous_audio_url,
        previous_generated_at: r.previous_generated_at,
      });
    }

    return { rows: out };
  });

export const updateScriptRowText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { script_row_id: string; transcript: string }) =>
    z.object({ script_row_id: z.string().uuid(), transcript: z.string().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("listening_scripts")
      .update({ transcript: data.transcript, audio_stale: true })
      .eq("id", data.script_row_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const regenerateSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { script_row_id: string }) =>
    z.object({ script_row_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const userEmail = ((context as { claims?: { email?: string } }).claims?.email ?? "").toLowerCase();

    const { data: row, error } = await supabase
      .from("listening_scripts")
      .select("id,exercise_id,transcript,speaker_label,audio_path,audio_generated_at,audio_stale,previous_transcript,previous_audio_path,previous_generated_at,sequence,item_index")
      .eq("id", data.script_row_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Segment not found");

    const { ex, resolveLabel } = await loadExerciseContext(supabase, userId, row.exercise_id);
    const voice = resolveLabel(row.speaker_label);

    const { spendCredits, refundCredits } = await import("@/lib/credits.server");
    const spend = await spendCredits({
      userId,
      userEmail,
      op: "segment_regenerate",
      reason: "regenerate_segment",
      metadata: { script_row_id: row.id, exercise_id: row.exercise_id },
    });

    try {
      await synthesizeAndPersistRow({
        row: {
          id: row.id,
          sequence: row.sequence,
          speaker_label: row.speaker_label,
          transcript: row.transcript,
          item_index: row.item_index,
          audio_path: row.audio_path,
          audio_generated_at: row.audio_generated_at,
          audio_stale: row.audio_stale,
          previous_transcript: row.previous_transcript,
          previous_audio_path: row.previous_audio_path,
          previous_generated_at: row.previous_generated_at,
        },
        voice,
        assessmentId: ex.assessment_id,
        exerciseId: ex.id,
      });
      return { ok: true };
    } catch (err) {
      if (spend.spent > 0) {
        await refundCredits({
          userId,
          amount: spend.spent,
          reason: "refund_regenerate_segment",
          metadata: { script_row_id: row.id },
        });
      }
      throw err;
    }
  });

export const revertSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { script_row_id: string }) =>
    z.object({ script_row_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("listening_scripts")
      .select("id,transcript,audio_path,audio_generated_at,previous_transcript,previous_audio_path,previous_generated_at")
      .eq("id", data.script_row_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Segment not found");
    if (!row.previous_audio_path || !row.previous_transcript) {
      throw new Error("No previous take to revert to");
    }

    // Swap current ↔ previous.
    const { error: updErr } = await supabase
      .from("listening_scripts")
      .update({
        transcript: row.previous_transcript,
        audio_path: row.previous_audio_path,
        audio_generated_at: row.previous_generated_at,
        audio_stale: false,
        previous_transcript: row.transcript,
        previous_audio_path: row.audio_path,
        previous_generated_at: row.audio_generated_at,
      })
      .eq("id", data.script_row_id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

export const generateStaleSegments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { exercise_id: string }) =>
    z.object({ exercise_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { ex, script, resolveLabel } = await loadExerciseContext(
      supabase,
      userId,
      data.exercise_id,
    );
    let synthesized = 0;
    for (const row of script) {
      if (row.audio_path && !row.audio_stale) continue;
      const voice = resolveLabel(row.speaker_label);
      // eslint-disable-next-line no-await-in-loop
      await synthesizeAndPersistRow({
        row,
        voice,
        assessmentId: ex.assessment_id,
        exerciseId: ex.id,
      });
      synthesized += 1;
    }
    return { ok: true, synthesized };
  });

export const restitchExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { exercise_id: string; allow_synthesis?: boolean }) =>
    z.object({
      exercise_id: z.string().uuid(),
      allow_synthesis: z.boolean().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { ex, script, questions, narrator, resolveLabel } = await loadExerciseContext(
      supabase,
      userId,
      data.exercise_id,
    );
    const segs = planExerciseSegments(ex, script, questions, resolveLabel, narrator);
    const rowById = new Map(script.map((r) => [r.id, r] as const));
    const stitched = await assembleFromPlan(segs, {
      assessmentId: ex.assessment_id,
      exerciseId: ex.id,
      rowById,
      allowSynthesis: data.allow_synthesis ?? false,
    });
    const audioUrl = await uploadExerciseAudio(ex.assessment_id, ex.id, stitched);
    return { audio_url: audioUrl, bytes: stitched.length };
  });
