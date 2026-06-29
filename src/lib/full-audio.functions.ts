// Stitch all exercise MP3s into one composite paper audio file.
// Uses concatenation of raw MP3 frames (same technique as audio.functions.ts).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

export const generateFullPaperAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { assessment_id: string; force?: boolean }) =>
    z
      .object({ assessment_id: z.string().uuid(), force: z.boolean().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: a, error: aErr } = await supabase
      .from("assessments")
      .select("id,title,full_audio_path")
      .eq("id", data.assessment_id)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!a) throw new Error("Assessment not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Re-use cached file when present.
    if (a.full_audio_path && !data.force) {
      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from("paper-audio")
        .createSignedUrl(a.full_audio_path, SIGNED_URL_TTL);
      if (!sErr && signed) {
        return {
          download_url: signed.signedUrl,
          filename: `${a.title}.mp3`,
          cached: true,
        };
      }
    }

    const { data: exs, error: eErr } = await supabase
      .from("exercises")
      .select("id,number,assessment_id")
      .eq("assessment_id", data.assessment_id)
      .order("number");
    if (eErr) throw new Error(eErr.message);
    if (!exs || exs.length === 0) throw new Error("No exercises on this paper");

    const missing = [] as number[];
    const bufs: Uint8Array[] = [];
    for (const ex of exs) {
      const path = `${ex.assessment_id}/${ex.id}.mp3`;
      // eslint-disable-next-line no-await-in-loop
      const { data: blob, error: dErr } = await supabaseAdmin.storage
        .from("exercise-audio")
        .download(path);
      if (dErr || !blob) {
        missing.push(ex.number);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      bufs.push(new Uint8Array(await blob.arrayBuffer()));
    }
    if (missing.length > 0) {
      throw new Error(
        `Generate audio first for exercise(s): ${missing.join(", ")}.`,
      );
    }

    const total = bufs.reduce((n, b) => n + b.length, 0);
    const stitched = new Uint8Array(total);
    let off = 0;
    for (const b of bufs) {
      stitched.set(b, off);
      off += b.length;
    }

    const path = `${a.id}/full.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("paper-audio")
      .upload(path, stitched, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("paper-audio")
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Signed URL failed");

    await supabaseAdmin
      .from("assessments")
      .update({ full_audio_path: path, full_audio_generated_at: new Date().toISOString() })
      .eq("id", a.id);

    return {
      download_url: signed.signedUrl,
      filename: `${a.title}.mp3`,
      cached: false,
    };
  });
