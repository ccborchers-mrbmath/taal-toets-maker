// Server function: render the question paper / mark scheme / transcript
// as a PDF using pdf-lib (Worker-safe). Returns base64 + filename for the
// client to trigger a download.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

type PdfKind = "paper" | "mark_scheme" | "transcript";

const Input = z.object({
  assessment_id: z.string().uuid(),
  kind: z.enum(["paper", "mark_scheme", "transcript"]),
});

// pdf-lib standard fonts use WinAnsi (CP1252). Afrikaans letters (ê, ô, ë…)
// fit, but checkmarks, smart quotes, em-dashes etc. do not — sanitize.
function sanitize(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2713|\u2714/g, "v")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

type FullPaper = {
  assessment: {
    id: string;
    title: string;
    paper_code: string;
    level: string;
    status: string;
  };
  exercises: {
    id: string;
    number: number;
    kind: string;
    rubric: string;
    statements: unknown;
    questions: {
      id: string;
      number: number;
      stem: string;
      correct_letter: string;
      speaker_index: number | null;
      question_options: {
        id: string;
        letter: string;
        text: string | null;
        image_prompt: string | null;
      }[];
    }[];
    listening_scripts: { sequence: number; speaker_label: string | null; transcript: string }[];
  }[];
};

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  header: { title: string; subtitle: string };
};

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
  drawPageHeader(ctx);
}

function drawPageHeader(ctx: Ctx) {
  ctx.page.drawText(sanitize(ctx.header.title), {
    x: MARGIN,
    y: PAGE_H - MARGIN + 14,
    size: 8,
    font: ctx.bold,
    color: rgb(0.3, 0.3, 0.3),
  });
  ctx.page.drawText(sanitize(ctx.header.subtitle), {
    x: PAGE_W - MARGIN - ctx.font.widthOfTextAtSize(sanitize(ctx.header.subtitle), 8),
    y: PAGE_H - MARGIN + 14,
    size: 8,
    font: ctx.font,
    color: rgb(0.3, 0.3, 0.3),
  });
  ctx.page.drawLine({
    start: { x: MARGIN, y: PAGE_H - MARGIN + 8 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN + 8 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN) newPage(ctx);
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
      if (line) lines.push(line);
      // word itself too long: hard-break by char
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      } else line = w;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(
  ctx: Ctx,
  text: string,
  opts: { size?: number; font?: PDFFont; x?: number; maxWidth?: number; color?: ReturnType<typeof rgb>; lineGap?: number } = {},
) {
  const size = opts.size ?? 10;
  const font = opts.font ?? ctx.font;
  const x = opts.x ?? MARGIN;
  const maxWidth = opts.maxWidth ?? CONTENT_W - (x - MARGIN);
  const lineGap = opts.lineGap ?? 2;
  const lh = size + lineGap;
  const lines = wrap(font, text, size, maxWidth);
  for (const ln of lines) {
    ensure(ctx, lh);
    ctx.page.drawText(ln, { x, y: ctx.y - size, size, font, color: opts.color ?? rgb(0.1, 0.12, 0.2) });
    ctx.y -= lh;
  }
}

function gap(ctx: Ctx, h: number) {
  ctx.y -= h;
}

function rule(ctx: Ctx) {
  ensure(ctx, 12);
  gap(ctx, 6);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.75, 0.7, 0.6),
  });
  gap(ctx, 8);
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

async function renderCover(ctx: Ctx, a: FullPaper["assessment"], kindLabel: string) {
  ctx.y = PAGE_H - MARGIN - 40;
  ctx.page.drawText("CAMBRIDGE IGCSE", { x: MARGIN, y: ctx.y, size: 10, font: ctx.bold, color: rgb(0.2, 0.25, 0.4) });
  ctx.y -= 16;
  ctx.page.drawText(sanitize(a.paper_code), { x: MARGIN, y: ctx.y, size: 10, font: ctx.font, color: rgb(0.35, 0.35, 0.4) });
  ctx.y -= 28;
  drawText(ctx, a.title, { size: 22, font: ctx.bold });
  gap(ctx, 6);
  drawText(ctx, kindLabel, { size: 13, font: ctx.italic, color: rgb(0.35, 0.35, 0.4) });
  gap(ctx, 4);
  drawText(ctx, `Vlak: ${a.level === "extended" ? "Uitgebreid (Extended)" : "Kern (Core)"}`, {
    size: 10,
    color: rgb(0.35, 0.35, 0.4),
  });
  rule(ctx);
}

function exTitle(num: number) {
  return `Oefening ${num}`;
}

async function renderPaper(ctx: Ctx, p: FullPaper, supabaseAdmin: SupabaseAdminLike) {
  for (const ex of p.exercises) {
    ensure(ctx, 60);
    drawText(ctx, exTitle(ex.number), { size: 14, font: ctx.bold });
    gap(ctx, 2);
    drawText(ctx, ex.rubric, { size: 10, color: rgb(0.3, 0.3, 0.35) });
    gap(ctx, 6);

    // Statements panel for Ex4
    const statements = Array.isArray(ex.statements)
      ? (ex.statements as { letter: string; text: string }[])
      : null;
    if (statements && statements.length) {
      gap(ctx, 4);
      for (const s of statements) {
        drawText(ctx, `${s.letter}  ${s.text}`, { size: 10, x: MARGIN + 14 });
      }
      gap(ctx, 6);
    }

    const sortedQs = [...ex.questions].sort((a, b) => a.number - b.number);
    for (const q of sortedQs) {
      ensure(ctx, 30);
      gap(ctx, 4);
      drawText(ctx, `${q.number}.  ${q.stem}`, { size: 10.5, font: ctx.bold });
      gap(ctx, 2);

      const opts = [...q.question_options].sort((a, b) => a.letter.localeCompare(b.letter));
      const hasImages = opts.some((o) => o.image_prompt);

      if (hasImages) {
        // 4 picture options in a row
        const cols = opts.length;
        const colW = (CONTENT_W - (cols - 1) * 8) / cols;
        const imgH = colW; // square
        ensure(ctx, imgH + 22);
        const rowTop = ctx.y;
        for (let i = 0; i < opts.length; i++) {
          const o = opts[i];
          const x = MARGIN + i * (colW + 8);
          // border
          ctx.page.drawRectangle({
            x,
            y: rowTop - imgH,
            width: colW,
            height: imgH,
            borderColor: rgb(0.6, 0.55, 0.45),
            borderWidth: 0.6,
          });
          // image
          const png = await tryDownloadOptionImage(supabaseAdmin, p.assessment.id, o.id);
          if (png) {
            try {
              const embedded = await ctx.doc.embedPng(png);
              const scale = Math.min((colW - 8) / embedded.width, (imgH - 8) / embedded.height);
              const w = embedded.width * scale;
              const h = embedded.height * scale;
              ctx.page.drawImage(embedded, {
                x: x + (colW - w) / 2,
                y: rowTop - imgH + (imgH - h) / 2,
                width: w,
                height: h,
              });
            } catch {
              /* fall through to placeholder text */
            }
          } else if (o.image_prompt) {
            const txt = wrap(ctx.font, o.image_prompt, 7, colW - 8).slice(0, 5);
            let ty = rowTop - 12;
            for (const ln of txt) {
              ctx.page.drawText(ln, { x: x + 4, y: ty, size: 7, font: ctx.italic, color: rgb(0.5, 0.5, 0.5) });
              ty -= 9;
            }
          }
          // letter badge
          ctx.page.drawText(o.letter, {
            x: x + 4,
            y: rowTop - imgH - 12,
            size: 10,
            font: ctx.bold,
          });
          if (o.text) {
            ctx.page.drawText(sanitize(o.text), {
              x: x + 16,
              y: rowTop - imgH - 12,
              size: 9,
              font: ctx.font,
            });
          }
        }
        ctx.y = rowTop - imgH - 20;
      } else {
        for (const o of opts) {
          drawText(ctx, `${o.letter}   ${o.text ?? ""}`, { size: 10, x: MARGIN + 18 });
        }
      }
    }
    rule(ctx);
  }
}

function renderMarkScheme(ctx: Ctx, p: FullPaper) {
  for (const ex of p.exercises) {
    ensure(ctx, 40);
    drawText(ctx, exTitle(ex.number), { size: 13, font: ctx.bold });
    gap(ctx, 4);
    const qs = [...ex.questions].sort((a, b) => a.number - b.number);
    // 4-column grid of "n: X"
    const cols = 4;
    const colW = CONTENT_W / cols;
    let col = 0;
    let rowY = ctx.y;
    const rowH = 16;
    for (const q of qs) {
      if (col === 0) {
        ensure(ctx, rowH);
        rowY = ctx.y;
      }
      const x = MARGIN + col * colW;
      ctx.page.drawText(`${q.number}.`, { x, y: rowY - 12, size: 10, font: ctx.font });
      ctx.page.drawText(q.correct_letter || "-", {
        x: x + 24,
        y: rowY - 12,
        size: 11,
        font: ctx.bold,
        color: rgb(0.15, 0.3, 0.5),
      });
      col++;
      if (col === cols) {
        col = 0;
        ctx.y -= rowH;
      }
    }
    if (col !== 0) ctx.y -= rowH;
    rule(ctx);
  }
}

function renderTranscript(ctx: Ctx, p: FullPaper) {
  for (const ex of p.exercises) {
    ensure(ctx, 40);
    drawText(ctx, exTitle(ex.number), { size: 13, font: ctx.bold });
    gap(ctx, 4);
    drawText(ctx, ex.rubric, { size: 9, font: ctx.italic, color: rgb(0.45, 0.4, 0.35) });
    gap(ctx, 6);
    const lines = [...ex.listening_scripts].sort((a, b) => a.sequence - b.sequence);
    if (!lines.length) {
      drawText(ctx, "(geen transkripsie nie)", { size: 10, color: rgb(0.5, 0.5, 0.5) });
    }
    for (const ln of lines) {
      const label = ln.speaker_label ? `${ln.speaker_label}: ` : "";
      drawText(ctx, `${label}${ln.transcript}`, { size: 10 });
      gap(ctx, 3);
    }
    rule(ctx);
  }
}

// ---------------------------------------------------------------------------
// Storage image fetcher
// ---------------------------------------------------------------------------

type SupabaseAdminLike = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
};

async function tryDownloadOptionImage(
  supabaseAdmin: SupabaseAdminLike,
  assessmentId: string,
  optionId: string,
): Promise<Uint8Array | null> {
  try {
    const path = `${assessmentId}/${optionId}.png`;
    const { data, error } = await supabaseAdmin.storage.from("option-images").download(path);
    if (error || !data) return null;
    const buf = await data.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Export server function
// ---------------------------------------------------------------------------

export const generatePaperPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as {
      supabase: {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
              order: (col: string) => Promise<{ data: unknown; error: { message: string } | null }>;
            };
          };
        };
      };
    };

    const { data: aRaw, error: aErr } = await supabase
      .from("assessments")
      .select("id,title,paper_code,level,status")
      .eq("id", data.assessment_id)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!aRaw) throw new Error("Assessment not found");
    const a = aRaw as FullPaper["assessment"];

    const { data: exsRaw, error: exErr } = await supabase
      .from("exercises")
      .select(
        "id,number,kind,rubric,statements,questions(id,number,stem,correct_letter,speaker_index,question_options(id,letter,text,image_prompt)),listening_scripts(sequence,speaker_label,transcript)",
      )
      .eq("assessment_id", data.assessment_id)
      .order("number");
    if (exErr) throw new Error(exErr.message);
    const exercises = ((exsRaw ?? []) as FullPaper["exercises"]).sort((x, y) => x.number - y.number);

    if (!exercises.length) throw new Error("Geen oefeninge om uit te voer nie — genereer eers die vraestel.");

    const paper: FullPaper = { assessment: a, exercises };

    const kindLabel: Record<PdfKind, string> = {
      paper: "Vraestel 2 — Luister",
      mark_scheme: "Memorandum",
      transcript: "Transkripsie",
    };

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

    const ctx: Ctx = {
      doc,
      page: doc.addPage([PAGE_W, PAGE_H]),
      y: PAGE_H - MARGIN,
      font,
      bold,
      italic,
      header: {
        title: `${a.title} — ${kindLabel[data.kind]}`,
        subtitle: a.paper_code,
      },
    };
    drawPageHeader(ctx);
    await renderCover(ctx, a, kindLabel[data.kind]);

    if (data.kind === "paper") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await renderPaper(ctx, paper, supabaseAdmin as unknown as SupabaseAdminLike);
    } else if (data.kind === "mark_scheme") {
      renderMarkScheme(ctx, paper);
    } else {
      renderTranscript(ctx, paper);
    }

    const bytes = await doc.save();
    // base64 for JSON transport
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);

    const safeTitle = a.title.replace(/[^\w\-]+/g, "_").slice(0, 60);
    const suffix = { paper: "vraestel", mark_scheme: "memorandum", transcript: "transkripsie" }[data.kind];
    return {
      filename: `${safeTitle}_${suffix}.pdf`,
      mime: "application/pdf",
      base64,
    };
  });
