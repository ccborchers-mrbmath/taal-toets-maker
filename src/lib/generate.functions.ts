// Server function: generate a Cambridge IGCSE Afrikaans (0548) Paper 2
// listening paper. Mirrors the original Audio Genius generator, adapted to
// TanStack Start + Lovable AI Gateway, with Afrikaans-locked output.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ExerciseNum, PaperScript, PartType } from "@/lib/parts";

// ---------------------------------------------------------------------------
// Per-exercise specs (Afrikaans rubrics verbatim from the 2025 specimen)
// ---------------------------------------------------------------------------

const EXERCISE_BRIEFS: Record<ExerciseNum, {
  type: "mcq_picture" | "mcq_text_pair" | "mcq_long" | "matching";
  numberRange: [number, number];
  readingPause: number;
  instructions: string;
  brief: string;
}> = {
  1: {
    type: "mcq_picture",
    numberRange: [1, 8],
    readingPause: 15,
    instructions:
      "Jy sal agt kort opnames hoor. Vir elke vraag kies die korrekte antwoord, A, B, C of D, en maak ’n regmerkie (✓) in die korrekte blokkie. Jy sal elke opname twee keer hoor.",
    brief:
      "Skryf 8 ONAFHANKLIKE kort opnames (~30–45 sekondes elk) in natuurlike Suid-Afrikaanse Afrikaans. Elke item het EEN vraag met VIER prent-opsies A–D. Verskaf vir elke opsie 'n kort `image_prompt` (lewendige, eenvoudige foto-styl beskrywing — geen teks in die prent) en 'n 1–4 woord `label`. Wissel monoloog/dialoog oor die 8 items.",
  },
  2: {
    type: "mcq_text_pair",
    numberRange: [9, 18],
    readingPause: 30,
    instructions:
      "Jy sal vyf kort opnames hoor. Vir elke vraag kies die korrekte antwoord, A, B of C, en maak ’n regmerkie (✓) in die korrekte blokkie. Jy sal elke opname twee keer hoor.",
    brief:
      "Skryf 5 kort opnames (~45–60 sekondes elk) in Afrikaans. Elke opname het 'n een-sin `context` raamwerk wat die verteller eers sê (bv. 'Jy gaan twee vriende hoor praat oor ...') en TWEE MK-vrae (3 opsies A–C elk). 10 vrae in totaal, genommer 9–18.",
  },
  3: {
    type: "mcq_long",
    numberRange: [19, 26],
    readingPause: 45,
    instructions:
      "Jy sal 'n langer praatjie hoor. Vir elke vraag kies die korrekte antwoord, A, B of C, en maak ’n regmerkie (✓) in die korrekte blokkie. Jy sal die praatjie twee keer hoor.",
    brief:
      "Skryf EEN langer monoloog (~3–4 minute, omtrent 500–700 woorde) in Afrikaans deur 'n enkele genoemde spreker. Voeg 8 MK-vrae by (3 opsies A–C elk), genommer 19–26, wie se antwoorde in volgorde in die praatjie verskyn.",
  },
  4: {
    type: "matching",
    numberRange: [27, 32],
    readingPause: 30,
    instructions:
      "Jy sal ses mense oor dieselfde tema hoor praat. Vir Vrae 27–32, kies uit die lys (A–H) watter idee elke spreker uitdruk. Gebruik elke letter slegs een keer. Daar is twee ekstra letters wat jy nie hoef te gebruik nie. Jy sal die opnames twee keer hoor.",
    brief:
      "Kies EEN gedeelde tema. Skryf 8 eerstepersoonsstellings A–H in Afrikaans (een kort sin elk) as die passingsopsies. Skryf dan 6 KORT spreker-monoloë (~30 sekondes elk, ~60–90 woorde). Elke spreker se monoloog moet EEN van die stellings duidelik uitdruk sonder om dit aan te haal. Twee van die 8 stellings word nie gebruik nie (afleiers).",
  },
  5: {
    type: "mcq_long",
    numberRange: [33, 40],
    readingPause: 45,
    instructions:
      "Jy sal 'n langer onderhoud hoor. Vir elke vraag kies die korrekte antwoord, A, B of C, en maak ’n regmerkie (✓) in die korrekte blokkie. Jy sal die onderhoud twee keer hoor.",
    brief:
      "Skryf EEN langer onderhoud (~4 minute, omtrent 600–800 woorde) in Afrikaans tussen 'n onderhoudvoerder en 'n genoemde gas. Gebruik realistiese gesprekswisselings. Voeg 8 MK-vrae by (3 opsies A–C elk), genommer 33–40, wie se antwoorde in volgorde in die gesprek verskyn.",
  },
};

// ---------------------------------------------------------------------------
// Tool-call JSON schemas (one per exercise type)
// ---------------------------------------------------------------------------

const turnSchema = {
  type: "object",
  properties: {
    speaker: { type: "string", description: "Short label, e.g. 'M', 'V', 'M1', 'Onderhoudvoerder', or first name." },
    text: { type: "string" },
  },
  required: ["speaker", "text"],
  additionalProperties: false,
} as const;

const speakersMetaSchema = {
  type: "array",
  description:
    "One descriptor per speaker in this item, in the form 'LABEL: geslag, ouderdom, aksent'. Example: 'V: vroulik, tienerouderdom, Wes-Kaapse aksent'.",
  items: { type: "string" },
} as const;

const optionABCD = {
  type: "object",
  properties: {
    letter: { type: "string", enum: ["A", "B", "C", "D"] },
    label: { type: "string", description: "Kort onderskrif (1–4 woorde) in Afrikaans wat die prent beskryf." },
    image_prompt: { type: "string", description: "Photo-style English image prompt for the picture (no text in the image)." },
  },
  required: ["letter", "label", "image_prompt"],
  additionalProperties: false,
} as const;

const optionABC = {
  type: "object",
  properties: {
    letter: { type: "string", enum: ["A", "B", "C"] },
    label: { type: "string" },
  },
  required: ["letter", "label"],
  additionalProperties: false,
} as const;

function toolFor(exNum: ExerciseNum) {
  const spec = EXERCISE_BRIEFS[exNum];

  if (spec.type === "mcq_picture") {
    return {
      type: "function" as const,
      function: {
        name: "emit_exercise_1",
        description: "Emit Exercise 1: 8 short extracts with picture-based MCQ.",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              description: "Exactly 8 items, numbered 1–8.",
              items: {
                type: "object",
                properties: {
                  number: { type: "number" },
                  prompt: { type: "string", description: "Question stem in Afrikaans." },
                  context: { type: "string" },
                  speakers_meta: speakersMetaSchema,
                  turns: { type: "array", items: turnSchema },
                  options: { type: "array", description: "Exactly 4 options A,B,C,D.", items: optionABCD },
                  answer: { type: "string", enum: ["A", "B", "C", "D"] },
                },
                required: ["number", "prompt", "speakers_meta", "turns", "options", "answer"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    };
  }

  if (spec.type === "mcq_text_pair") {
    return {
      type: "function" as const,
      function: {
        name: "emit_exercise_2",
        description: "Emit Exercise 2: 5 short recordings, 2 MCQs each.",
        parameters: {
          type: "object",
          properties: {
            pair_items: {
              type: "array",
              description: "Exactly 5 recordings.",
              items: {
                type: "object",
                properties: {
                  context: { type: "string" },
                  speakers_meta: speakersMetaSchema,
                  turns: { type: "array", items: turnSchema },
                  questions: {
                    type: "array",
                    description: "Exactly 2 MCQs per recording.",
                    items: {
                      type: "object",
                      properties: {
                        number: { type: "number" },
                        prompt: { type: "string" },
                        options: { type: "array", items: optionABC },
                        answer: { type: "string", enum: ["A", "B", "C"] },
                      },
                      required: ["number", "prompt", "options", "answer"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["context", "speakers_meta", "turns", "questions"],
                additionalProperties: false,
              },
            },
          },
          required: ["pair_items"],
          additionalProperties: false,
        },
      },
    };
  }

  if (spec.type === "mcq_long") {
    return {
      type: "function" as const,
      function: {
        name: exNum === 3 ? "emit_exercise_3" : "emit_exercise_5",
        description:
          exNum === 3
            ? "Emit Exercise 3: long talk with 8 MCQs (A–C)."
            : "Emit Exercise 5: long interview with 8 MCQs (A–C).",
        parameters: {
          type: "object",
          properties: {
            speakers_meta: speakersMetaSchema,
            turns: { type: "array", items: turnSchema, description: "Full transcript of the recording in Afrikaans." },
            items: {
              type: "array",
              description: "Exactly 8 MCQs in order.",
              items: {
                type: "object",
                properties: {
                  number: { type: "number" },
                  prompt: { type: "string" },
                  options: { type: "array", items: optionABC },
                  answer: { type: "string", enum: ["A", "B", "C"] },
                },
                required: ["number", "prompt", "options", "answer"],
                additionalProperties: false,
              },
            },
          },
          required: ["speakers_meta", "turns", "items"],
          additionalProperties: false,
        },
      },
    };
  }

  // matching (Ex 4)
  return {
    type: "function" as const,
    function: {
      name: "emit_exercise_4",
      description: "Emit Exercise 4: 6 short monologues with A–H matching task.",
      parameters: {
        type: "object",
        properties: {
          shared_options: {
            type: "array",
            description: "Exactly 8 first-person Afrikaans statements A–H.",
            items: {
              type: "object",
              properties: {
                letter: { type: "string", enum: ["A", "B", "C", "D", "E", "F", "G", "H"] },
                text: { type: "string" },
              },
              required: ["letter", "text"],
              additionalProperties: false,
            },
          },
          speaker_items: {
            type: "array",
            description: "Exactly 6 monologues, numbered 27–32.",
            items: {
              type: "object",
              properties: {
                number: { type: "number" },
                speakers_meta: speakersMetaSchema,
                turns: { type: "array", items: turnSchema, description: "Single speaker monologue (1 turn)." },
                answer: { type: "string", enum: ["A", "B", "C", "D", "E", "F", "G", "H"] },
              },
              required: ["number", "speakers_meta", "turns", "answer"],
              additionalProperties: false,
            },
          },
        },
        required: ["shared_options", "speaker_items"],
        additionalProperties: false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Brief parsing (markdown stored in assessments.brief)
// ---------------------------------------------------------------------------

type ParsedBrief = {
  theme: string;
  perExercise: Record<number, { notes: string; sharedTheme?: string; slots: string[] }>;
};

function parseBrief(raw: string): ParsedBrief {
  const out: ParsedBrief = { theme: "", perExercise: {} };
  if (!raw) return out;
  const lines = raw.split(/\r?\n/);
  let section: "theme" | number | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (section === null) return;
    const text = buf.join("\n").trim();
    if (section === "theme") {
      out.theme = text;
    } else {
      const exNum = section;
      const slotMatches = [
        ...text.matchAll(
          /^- (?:Vraag|Question|Opname|Recording|Spreker|Speaker|Praatjie|Talk|Onderhoud|Interview)\s*(\d+):\s*(.+)$/gim,
        ),
      ];
      const slots: string[] = [];
      for (const m of slotMatches) slots[parseInt(m[1], 10) - 1] = m[2].trim();
      const sharedThemeMatch = text.match(/^(?:Gedeelde tema|Shared theme):\s*(.+)$/im);
      const notes = text
        .replace(
          /^- (?:Vraag|Question|Opname|Recording|Spreker|Speaker|Praatjie|Talk|Onderhoud|Interview)\s*\d+:\s*.+$/gim,
          "",
        )
        .replace(/^(?:Gedeelde tema|Shared theme):.+$/im, "")
        .trim();
      out.perExercise[exNum] = {
        notes,
        sharedTheme: sharedThemeMatch?.[1]?.trim(),
        slots,
      };
    }
    buf = [];
  };
  for (const ln of lines) {
    if (/^#\s+(?:Algehele tema|Overall theme)/i.test(ln)) { flush(); section = "theme"; continue; }
    const exHeader = ln.match(/^##\s+(?:Oefening|Exercise)\s+(\d+)/i);
    if (exHeader) { flush(); section = parseInt(exHeader[1], 10); continue; }
    buf.push(ln);
  }
  flush();
  return out;
}

function buildUserGuidance(exNum: ExerciseNum, parsed: ParsedBrief): string {
  const perEx = parsed.perExercise[exNum];
  if (!perEx) return "";
  const parts: string[] = [];
  if (perEx.sharedTheme) parts.push(`Gedeelde tema vir die sprekers: ${perEx.sharedTheme}`);
  if (perEx.notes) parts.push(`Notas vir hierdie oefening:\n${perEx.notes}`);
  const filled = perEx.slots
    .map((s, i) => (s ? `  ${i + 1}. ${s}` : null))
    .filter(Boolean);
  if (filled.length) {
    parts.push(
      `Gebruik hierdie spesifieke scenarios waar verskaf (nommers verwys na vraag/opname/spreker; ander slotte: vry maar getrou aan tema):\n${filled.join("\n")}`,
    );
  }
  return parts.length ? `\n\nOnderwyser se brief vir Oefening ${exNum}:\n${parts.join("\n\n")}` : "";
}

// ---------------------------------------------------------------------------
// Single AI call for one exercise
// ---------------------------------------------------------------------------

export type CastLite = {
  id: string;
  name: string;
  gender: string;
  age_band: string;
  tags: string[];
};

function castBlock(cast: CastLite[]): string {
  if (cast.length === 0) {
    return "Geen stem-rolverdeling is verskaf nie — gebruik kort etikette ('M', 'V', voorname).";
  }
  const lines = cast.map(
    (c) =>
      `  • ${c.name} — ${c.gender}, ${c.age_band}${c.tags.length ? `, ${c.tags.join(", ")}` : ""}`,
  );
  return [
    "BESKIKBARE STEM-ROLVERDELING (gebruik UITSLUITLIK hierdie name as `speaker`):",
    ...lines,
    "Reëls:",
    "  - Elke `speaker` veld in `turns` MOET presies een van bogenoemde name wees (hoofletter-sensitief).",
    "  - Kies stemme wie se geslag en ouderdom by die karakter pas.",
    "  - Moenie meer afsonderlike sprekers in 'n item gebruik as wat in die rolverdeling beskikbaar is nie.",
    "  - Moenie verteller-instruksies (rubriek) in `turns` insluit nie — slegs karakter-spraak.",
  ].join("\n");
}

async function generateExercise(opts: {
  apiKey: string;
  level: "core" | "extended";
  topic: string;
  title: string;
  exNum: ExerciseNum;
  brief: ParsedBrief;
  cast: CastLite[];
}) {
  const spec = EXERCISE_BRIEFS[opts.exNum];
  const teacherGuidance = buildUserGuidance(opts.exNum, opts.brief);
  const themeForPrompt = opts.brief.theme || opts.topic || "Kies 'n ouderdomstoepaslike alledaagse tema.";
  const cast = castBlock(opts.cast);

  const systemPrompt = `Jy is 'n kundige skrywer van Cambridge IGCSE Afrikaans as 'n Tweede Taal (0548) Vraestel 2 (Luister) toetsmateriaal.
Skryf alle inhoud in natuurlike Suid-Afrikaanse Afrikaans wat toepaslik is vir 14–16-jarige kandidate op ${opts.level === "extended" ? "die Uitgebreide (Extended)" : "die Kern (Core)"} vlak.
- Gebruik realistiese, lewendige dialoog met natuurlike weersprekings en wending.
- Maak afleiers geloofwaardig — verkeerde opsies moet redelik klink.
- Antwoorde moet ondubbelsinnig deur die teks ondersteun word.
- Moenie antwoordletters in die transkripsie noem nie.
- Verskaf 'n "speakers_meta" beskrywing vir ELKE spreker in ELKE item in die vorm 'NAAM: geslag, ouderdom, aksent' (bv. 'Sarah: vroulik, tienerouderdom, Pretoriase aksent').
- Sillabus-relevante temas: alledaagse lewe, skool, vryetyd, omgewing, werk/loopbane, kultuur, tegnologie.

${cast}`;

  const userPrompt = `Genereer Oefening ${opts.exNum} van 'n ${opts.level === "extended" ? "UITGEBREIDE" : "KERN"}-vlak Cambridge IGCSE 0548/02 luistervraestel.

Vraestel titel: ${opts.title}
Algehele tema: ${themeForPrompt}

Standaard instruksies vir hierdie oefening (reeds aan kandidate gewys): "${spec.instructions}"

Vereistes:
${spec.brief}

Vraagnommers moet in die reeks ${spec.numberRange[0]}–${spec.numberRange[1]} wees.${teacherGuidance}`;

  const tool = toolFor(opts.exNum);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: tool.function.name } },
    }),
  });

  if (response.status === 429) throw new Error("RATE_LIMIT");
  if (response.status === 402) throw new Error("PAYMENT_REQUIRED");
  if (!response.ok) {
    const t = await response.text();
    console.error(`AI gateway error (Ex ${opts.exNum}):`, response.status, t);
    throw new Error(`AI gateway error (Ex ${opts.exNum})`);
  }

  const result = await response.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error(`No tool call returned for Ex ${opts.exNum}`);
  const args = JSON.parse(toolCall.function.arguments);

  return {
    number: opts.exNum,
    type: spec.type,
    title: `Oefening ${opts.exNum}`,
    instructions: spec.instructions,
    reading_pause_s: spec.readingPause,
    ...args,
  };
}

// Filter the paper-wide cast to the voices flagged suitable for a given exercise.
function castForExercise(all: (CastLite & { suitability: Record<string, boolean | undefined> })[], exNum: ExerciseNum): CastLite[] {
  const want: string[] =
    exNum === 1 ? ["ex1"]
    : exNum === 2 ? ["ex2"]
    : exNum === 3 ? ["ex3"]
    : exNum === 4 ? ["ex4"]
    : ["ex5_interviewer", "ex5_interviewee"];
  const filtered = all.filter((v) => want.some((k) => v.suitability?.[k]));
  return (filtered.length ? filtered : all).map(({ id, name, gender, age_band, tags }) => ({ id, name, gender, age_band, tags }));
}

// ---------------------------------------------------------------------------
// Validation gate
// ---------------------------------------------------------------------------

function validateExercise(ex: { number: number; type: string; items?: unknown[]; pair_items?: unknown[]; speaker_items?: unknown[]; shared_options?: unknown[] }): string | null {
  const expected = { 1: 8, 2: 5, 3: 8, 4: 6, 5: 8 }[ex.number as 1 | 2 | 3 | 4 | 5];
  if (ex.type === "mcq_picture" && ex.items?.length !== expected) return `Ex${ex.number}: expected 8 items, got ${ex.items?.length}`;
  if (ex.type === "mcq_text_pair" && ex.pair_items?.length !== 5) return `Ex2: expected 5 recordings, got ${ex.pair_items?.length}`;
  if (ex.type === "mcq_long" && ex.items?.length !== 8) return `Ex${ex.number}: expected 8 MCQs, got ${ex.items?.length}`;
  if (ex.type === "matching") {
    if (ex.shared_options?.length !== 8) return `Ex4: expected 8 statements A–H`;
    if (ex.speaker_items?.length !== 6) return `Ex4: expected 6 speakers`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Persist to relational tables (exercises / questions / question_options /
// listening_scripts)
// ---------------------------------------------------------------------------

type Sb = {
  from: (table: string) => {
    insert: (rows: unknown) => { select: (cols?: string) => Promise<{ data: { id: string }[] | null; error: { message: string } | null }> };
    delete: () => { eq: (col: string, v: string) => Promise<{ error: { message: string } | null }> };
    update: (patch: unknown) => { eq: (col: string, v: string) => Promise<{ error: { message: string } | null }> };
  };
};

async function persistPaper(supabase: Sb, assessmentId: string, paper: PaperScript) {
  // Wipe any previous exercises (cascades to questions/options/scripts)
  await supabase.from("exercises").delete().eq("assessment_id", assessmentId);

  for (const ex of paper.exercises) {
    const { data: exRows, error: exErr } = await supabase
      .from("exercises")
      .insert({
        assessment_id: assessmentId,
        number: ex.number,
        kind: ex.type,
        rubric: ex.instructions,
        intro: null,
        statements: ex.shared_options ?? null,
      })
      .select("id");
    if (exErr || !exRows?.[0]) throw new Error(exErr?.message ?? "exercise insert failed");
    const exerciseId = exRows[0].id;

    // ---------- transcripts ----------
    const turns: { speaker: string; text: string }[] = [];
    if (ex.items) ex.items.forEach((it) => turns.push(...(it.turns ?? [])));
    if (ex.pair_items) ex.pair_items.forEach((p) => turns.push(...(p.turns ?? [])));
    if (ex.speaker_items) ex.speaker_items.forEach((it) => turns.push(...(it.turns ?? [])));
    for (const ex5 of [ex]) {
      // mcq_long stores turns at exercise level
      const longTurns = (ex5 as unknown as { turns?: { speaker: string; text: string }[] }).turns;
      if (Array.isArray(longTurns)) turns.push(...longTurns);
    }
    if (turns.length) {
      await supabase.from("listening_scripts").insert(
        turns.map((t, i) => ({
          exercise_id: exerciseId,
          sequence: i,
          speaker_label: t.speaker,
          transcript: t.text,
        })),
      );
    }

    // ---------- questions + options ----------
    type FlatQ = { number: number; stem: string; correct: string; options: { letter: string; text?: string; image_prompt?: string }[]; speakerIndex?: number };
    const flat: FlatQ[] = [];

    if (ex.type === "mcq_picture" && ex.items) {
      ex.items.forEach((it) =>
        flat.push({
          number: it.number,
          stem: it.prompt,
          correct: it.answer ?? "",
          options: (it.options ?? []).map((o) => ({ letter: o.letter, text: o.label, image_prompt: o.image_prompt })),
        }),
      );
    } else if (ex.type === "mcq_text_pair" && ex.pair_items) {
      ex.pair_items.forEach((p) =>
        p.questions.forEach((q) =>
          flat.push({
            number: q.number,
            stem: q.prompt,
            correct: q.answer,
            options: q.options.map((o) => ({ letter: o.letter, text: o.label })),
          }),
        ),
      );
    } else if (ex.type === "mcq_long" && ex.items) {
      ex.items.forEach((it) =>
        flat.push({
          number: it.number,
          stem: it.prompt,
          correct: it.answer ?? "",
          options: (it.options ?? []).map((o) => ({ letter: o.letter, text: o.label })),
        }),
      );
    } else if (ex.type === "matching" && ex.speaker_items && ex.shared_options) {
      ex.speaker_items.forEach((sp, idx) =>
        flat.push({
          number: sp.number,
          stem: `Spreker ${idx + 1}`,
          correct: sp.answer ?? "",
          options: ex.shared_options!.map((o) => ({ letter: o.letter, text: o.text })),
          speakerIndex: idx + 1,
        }),
      );
    }

    for (const q of flat) {
      const { data: qRows, error: qErr } = await supabase
        .from("questions")
        .insert({
          exercise_id: exerciseId,
          number: q.number,
          stem: q.stem,
          correct_letter: q.correct,
          speaker_index: q.speakerIndex ?? null,
        })
        .select("id");
      if (qErr || !qRows?.[0]) throw new Error(qErr?.message ?? "question insert failed");
      const questionId = qRows[0].id;
      if (q.options.length) {
        await supabase.from("question_options").insert(
          q.options.map((o) => ({
            question_id: questionId,
            letter: o.letter,
            text: o.text ?? null,
            image_prompt: o.image_prompt ?? null,
          })),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The exported server function
// ---------------------------------------------------------------------------

const GenerateInput = z.object({ assessment_id: z.string().uuid() });

export const generatePaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { supabase, userId } = context as unknown as {
      supabase: {
        from: (t: string) => {
          select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> } };
          update: (patch: Record<string, unknown>) => { eq: (col: string, v: string) => Promise<{ error: { message: string } | null }> };
        };
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      };
      userId: string;
    };

    // Load assessment (RLS-scoped to the user)
    const { data: a, error: aErr } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", data.assessment_id)
      .maybeSingle();
    if (aErr || !a) throw new Error("Assessment not found");

    const partType = (a.part_type as PartType) ?? "full_paper";
    const level = (a.level as "core" | "extended") ?? "core";
    const brief = parseBrief((a.brief as string) ?? "");

    const exNums: ExerciseNum[] =
      partType === "full_paper" ? [1, 2, 3, 4, 5] : [parseInt(partType.replace("exercise", ""), 10) as ExerciseNum];

    // Spend credits (1 per generation) using admin client
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bal } = await (supabaseAdmin as unknown as { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { balance: number } | null }> } } } }).from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
    if (!bal || bal.balance < 1) throw new Error("Insufficient credits");

    await (supabaseAdmin as unknown as { from: (t: string) => { update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } } })
      .from("credit_balances").update({ balance: bal.balance - 1 }).eq("user_id", userId);
    await (supabaseAdmin as unknown as { from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> } })
      .from("credit_ledger").insert({ user_id: userId, delta: -1, reason: "generate_paper", metadata: { assessment_id: data.assessment_id } });

    // Mark generating
    await supabase.from("assessments").update({ status: "generating", generation_error: null }).eq("id", data.assessment_id);

    try {
      const exercises = await Promise.all(
        exNums.map((n) =>
          generateExercise({
            apiKey,
            level,
            topic: (a.theme_hint as string) ?? "",
            title: a.title as string,
            exNum: n,
            brief,
          }),
        ),
      );

      // Validate
      for (const ex of exercises) {
        const err = validateExercise(ex as { number: number; type: string; items?: unknown[]; pair_items?: unknown[]; speaker_items?: unknown[]; shared_options?: unknown[] });
        if (err) throw new Error(`Validation failed — ${err}`);
      }

      const now = new Date();
      const monthAf = ["Januarie","Februarie","Maart","April","Mei","Junie","Julie","Augustus","September","Oktober","November","Desember"][now.getMonth()];
      const paper: PaperScript = {
        schema_version: 2,
        meta: {
          title: a.title as string,
          topic: (a.theme_hint as string) ?? "",
          level,
          paper_code: (a.paper_code as string) ?? "0548/02",
          session_label: `${monthAf} ${now.getFullYear()}`,
        },
        exercises: exercises as PaperScript["exercises"],
      };

      await persistPaper(supabaseAdmin as unknown as Sb, data.assessment_id, paper);

      await supabase.from("assessments").update({ status: "ready" }).eq("id", data.assessment_id);
      return { ok: true, exercises: exercises.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("assessments").update({ status: "failed", generation_error: msg }).eq("id", data.assessment_id);
      // Refund credit on failure
      await (supabaseAdmin as unknown as { from: (t: string) => { update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } } })
        .from("credit_balances").update({ balance: bal.balance }).eq("user_id", userId);
      await (supabaseAdmin as unknown as { from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> } })
        .from("credit_ledger").insert({ user_id: userId, delta: 1, reason: "refund_generate_paper", metadata: { assessment_id: data.assessment_id } });
      throw new Error(msg);
    }
  });
