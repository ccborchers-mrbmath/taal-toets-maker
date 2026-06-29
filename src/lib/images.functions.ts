// Server function: generate a picture-option image for Exercise 1 (or any
// question_option that has an image_prompt). Uses Lovable AI Gateway's
// /v1/images/generations endpoint, uploads to the private `option-images`
// storage bucket, then returns a signed URL.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

async function generatePngFromPrompt(prompt: string): Promise<Uint8Array> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image",
      prompt: `${prompt}. Clean photographic style, single clear subject, no text, no captions, no watermarks, no logos.`,
      messages: [
        {
          role: "user",
          content: `${prompt}. Clean photographic style, single clear subject, no text, no captions, no watermarks, no logos.`,
        },
      ],
      modalities: ["image", "text"],
      n: 1,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI image rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI image credits exhausted. Top up Lovable AI credits.");
    throw new Error(`Image generation failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no data");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const generateOptionImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { option_id: string }) =>
    z.object({ option_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize + load option via RLS-scoped client (assessments.user_id = userId)
    const { data: opt, error: optErr } = await supabase
      .from("question_options")
      .select(
        "id,letter,image_prompt,image_url,question_id,questions!inner(exercise_id,exercises!inner(assessment_id))",
      )
      .eq("id", data.option_id)
      .maybeSingle();
    if (optErr) throw new Error(optErr.message);
    if (!opt) throw new Error("Option not found or access denied");
    if (!opt.image_prompt) throw new Error("This option has no image_prompt");

    const assessmentId = (opt as unknown as {
      questions: { exercises: { assessment_id: string; assessments: { user_id: string } } };
    }).questions.exercises.assessment_id;

    const png = await generatePngFromPrompt(opt.image_prompt);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${assessmentId}/${opt.id}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("option-images")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("option-images")
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr || !signed) throw new Error(`Signed URL failed: ${signErr?.message ?? "unknown"}`);

    const { error: updErr } = await supabaseAdmin
      .from("question_options")
      .update({ image_url: signed.signedUrl })
      .eq("id", opt.id);
    if (updErr) throw new Error(updErr.message);

    void userId;
    return { option_id: opt.id, image_url: signed.signedUrl };
  });

// Refresh a signed URL for an already-generated image without regenerating.
export const refreshOptionImageUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { option_id: string }) =>
    z.object({ option_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: opt, error } = await supabase
      .from("question_options")
      .select("id,questions!inner(exercises!inner(assessment_id))")
      .eq("id", data.option_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!opt) throw new Error("Option not found");
    const assessmentId = (opt as unknown as {
      questions: { exercises: { assessment_id: string } };
    }).questions.exercises.assessment_id;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${assessmentId}/${opt.id}.png`;
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("option-images")
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Signed URL failed");
    await supabaseAdmin
      .from("question_options")
      .update({ image_url: signed.signedUrl })
      .eq("id", opt.id);
    return { image_url: signed.signedUrl };
  });
