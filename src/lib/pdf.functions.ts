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
  force: z.boolean().optional(),
});

const PATH_COL: Record<PdfKind, "paper_pdf_path" | "mark_scheme_pdf_path" | "transcript_pdf_path"> = {
  paper: "paper_pdf_path",
  mark_scheme: "mark_scheme_pdf_path",
  transcript: "transcript_pdf_path",
};
const STAMP_COL: Record<PdfKind, string> = {
  paper: "paper_pdf_generated_at",
  mark_scheme: "mark_scheme_pdf_generated_at",
  transcript: "transcript_pdf_generated_at",
};

// pdf-lib standard fonts use WinAnsi (CP1252). Afrikaans letters (ê, ô, ë…)
// fit, but checkmarks, smart quotes, em-dashes etc. do not — sanitize.
// WinAnsi-encodable codepoints (CP1252). Anything outside this set will
// crash pdf-lib's StandardFonts at draw time, so strip aggressively.
const WINANSI_EXTRA = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function isWinAnsi(cp: number): boolean {
  if (cp >= 0x20 && cp <= 0x7e) return true;
  if (cp >= 0xa0 && cp <= 0xff) return true;
  return WINANSI_EXTRA.has(cp);
}

function sanitize(s: string): string {
  const pre = (s ?? "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2713|\u2714/g, "v")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\r\t]/g, " ")
    .replace(/\n+/g, " ");
  const normalized = pre.normalize("NFC");
  let out = "";
  for (const ch of normalized) {
    const cp = ch.codePointAt(0)!;
    if (isWinAnsi(cp)) {
      out += ch;
      continue;
    }
    // Decomposed fallback (e.g. ŝ -> s) — drop combining marks.
    const decomposed = ch.normalize("NFKD");
    for (const dch of decomposed) {
      const dcp = dch.codePointAt(0)!;
      if (dcp >= 0x0300 && dcp <= 0x036f) continue;
      if (isWinAnsi(dcp)) out += dch;
    }
  }
  return out;
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
    listening_scripts: { sequence: number; speaker_label: string | null; transcript: string; item_index: number | null }[];
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

// ---------------------------------------------------------------------------
// Cambridge-style cover page for the question paper. Mirrors the 0548/02
// specimen layout (school-logo block top-left, Cambridge Assessment block
// right-aligned, title row with date + paper code, instructions/information
// sections, and a page-count line that is filled in after the full document
// has been laid out).
// ---------------------------------------------------------------------------

type CoverHandles = {
  page: PDFPage;
  pageCountY: number;
  pageCountX: number;
};

async function renderPaperCover(
  ctx: Ctx,
  a: FullPaper["assessment"] & { date_of_assessment?: string | null },
  logoPng: Uint8Array | null,
): Promise<CoverHandles> {
  const page = ctx.page;
  // --- Top band: school logo box (left) + Cambridge Assessment block (right)
  const topY = PAGE_H - MARGIN;
  const logoBoxW = 110;
  const logoBoxH = 60;
  // School logo box (no border per spec — just placement)
  if (logoPng) {
    try {
      let embedded;
      try { embedded = await ctx.doc.embedPng(logoPng); }
      catch { embedded = await ctx.doc.embedJpg(logoPng); }
      const scale = Math.min(logoBoxW / embedded.width, logoBoxH / embedded.height);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      page.drawImage(embedded, {
        x: MARGIN + (logoBoxW - w) / 2,
        y: topY - logoBoxH + (logoBoxH - h) / 2,
        width: w,
        height: h,
      });
    } catch {
      page.drawText("School logo", { x: MARGIN + 8, y: topY - 24, size: 9, font: ctx.font, color: rgb(0.4, 0.4, 0.45) });
      page.drawText("goes here", { x: MARGIN + 8, y: topY - 36, size: 9, font: ctx.font, color: rgb(0.4, 0.4, 0.45) });
    }
  } else {
    page.drawText("School logo", { x: MARGIN + 8, y: topY - 24, size: 9, font: ctx.font, color: rgb(0.4, 0.4, 0.45) });
    page.drawText("goes here", { x: MARGIN + 8, y: topY - 36, size: 9, font: ctx.font, color: rgb(0.4, 0.4, 0.45) });
  }


  // Cambridge Assessment block (right aligned)
  const caLine1 = "Cambridge Assessment";
  const caLine2 = "International Education";
  const caSize = 12;
  const caW1 = ctx.bold.widthOfTextAtSize(caLine1, caSize);
  const caW2 = ctx.bold.widthOfTextAtSize(caLine2, caSize);
  const caRight = PAGE_W - MARGIN;
  // Small crest placeholder (square) to the left of the wordmark
  const crestSize = 26;
  const crestX = caRight - Math.max(caW1, caW2) - crestSize - 6;
  page.drawRectangle({
    x: crestX,
    y: topY - 30,
    width: crestSize,
    height: crestSize,
    borderColor: rgb(0.1, 0.15, 0.35),
    borderWidth: 1,
    color: rgb(0.1, 0.15, 0.35),
  });
  page.drawText("C", { x: crestX + 8, y: topY - 23, size: 16, font: ctx.bold, color: rgb(1, 1, 1) });
  page.drawText(caLine1, { x: caRight - caW1, y: topY - 14, size: caSize, font: ctx.bold, color: rgb(0.1, 0.15, 0.35) });
  page.drawText(caLine2, { x: caRight - caW2, y: topY - 28, size: caSize, font: ctx.bold, color: rgb(0.1, 0.15, 0.35) });

  // --- "Cambridge IGCSE™" title
  let y = topY - logoBoxH - 28;
  page.drawText("Cambridge IGCSE\u2122", { x: MARGIN, y, size: 22, font: ctx.bold });
  y -= 26;

  // --- Subject row: "AFRIKAANS AS A SECOND LANGUAGE"   [date]   0548/02
  const subject = "AFRIKAANS AS A SECOND LANGUAGE";
  page.drawText(subject, { x: MARGIN, y, size: 12, font: ctx.bold });
  // Paper code far right
  const codeText = a.paper_code || "0548/02";
  const codeW = ctx.bold.widthOfTextAtSize(codeText, 12);
  page.drawText(codeText, { x: PAGE_W - MARGIN - codeW, y, size: 12, font: ctx.bold });
  // Date of assessment in the middle (right-of-subject)
  if (a.date_of_assessment) {
    const dateText = `Date of assessment: ${a.date_of_assessment}`;
    const subjW = ctx.bold.widthOfTextAtSize(subject, 12);
    page.drawText(dateText, { x: MARGIN + subjW + 18, y, size: 10, font: ctx.font, color: rgb(0.2, 0.2, 0.25) });
  }
  y -= 18;

  // Paper 2 Listening   [right: For examination from 2025 — boxed]
  page.drawText("Paper 2 Listening", { x: MARGIN, y, size: 11, font: ctx.font });
  const fromLabel = "For examination from 2025";
  const fromW = ctx.bold.widthOfTextAtSize(fromLabel, 10);
  const fromBoxX = PAGE_W - MARGIN - fromW - 10;
  page.drawRectangle({ x: fromBoxX, y: y - 3, width: fromW + 10, height: 15, color: rgb(0.85, 0.85, 0.85) });
  page.drawText(fromLabel, { x: fromBoxX + 5, y: y, size: 10, font: ctx.bold });
  y -= 18;

  // SPECIMEN PAPER    Approximately 50 minutes (including 6 minutes' transfer time)
  page.drawText("SPECIMEN PAPER", { x: MARGIN, y, size: 11, font: ctx.bold });
  const durText = "Approximately 50 minutes (including 6 minutes' transfer time)";
  const durW = ctx.bold.widthOfTextAtSize(durText, 10);
  page.drawText(durText, { x: PAGE_W - MARGIN - durW, y, size: 10, font: ctx.bold });
  y -= 22;

  // Body text
  ctx.y = y;
  drawText(ctx, "You must transfer your answers onto the multiple choice answer sheet.", { size: 10 });
  gap(ctx, 10);

  // "You will need:" block
  const needLabelW = ctx.font.widthOfTextAtSize("You will need:", 10);
  page.drawText("You will need:", { x: MARGIN, y: ctx.y - 10, size: 10, font: ctx.font });
  const needX = MARGIN + needLabelW + 8;
  const needs = [
    "Multiple choice answer sheet",
    "Soft clean eraser",
    "Soft pencil (type B or HB is recommended)",
  ];
  let ny = ctx.y - 10;
  for (const n of needs) {
    page.drawText(n, { x: needX, y: ny, size: 10, font: ctx.font });
    ny -= 12;
  }
  ctx.y = ny - 6;

  // INSTRUCTIONS
  gap(ctx, 8);
  drawText(ctx, "INSTRUCTIONS", { size: 11, font: ctx.bold });
  const instructions = [
    "There are 40 questions on this paper. Answer all questions.",
    "You will have 6 minutes to transfer your answers from the question paper onto the multiple choice answer sheet.",
    "Follow the instructions on the multiple choice answer sheet. Shade one letter only for Questions 1 to 40.",
    "Write in soft pencil.",
    "Write your name, centre number and candidate number on the multiple choice answer sheet in the spaces provided unless this has been done for you.",
    "Do not use correction fluid.",
    "Do not write on any bar codes.",
    "Dictionaries are not allowed.",
  ];
  for (const ins of instructions) {
    ensure(ctx, 14);
    page.drawText("\u2022", { x: MARGIN + 6, y: ctx.y - 10, size: 11, font: ctx.font });
    const lines = wrap(ctx.font, ins, 10, CONTENT_W - 24);
    let ly = ctx.y - 10;
    for (let i = 0; i < lines.length; i++) {
      page.drawText(lines[i], { x: MARGIN + 20, y: ly, size: 10, font: ctx.font });
      ly -= 12;
    }
    ctx.y = ly + 12 - (lines.length * 12) - 4;
    ctx.y -= 2;
  }

  // INFORMATION
  gap(ctx, 8);
  drawText(ctx, "INFORMATION", { size: 11, font: ctx.bold });
  const info = [
    "The total mark for this paper is 40.",
    "Each correct answer will score one mark.",
    "Any rough working should be done on this question paper.",
  ];
  for (const it of info) {
    ensure(ctx, 14);
    page.drawText("\u2022", { x: MARGIN + 6, y: ctx.y - 10, size: 11, font: ctx.font });
    page.drawText(it, { x: MARGIN + 20, y: ctx.y - 10, size: 10, font: ctx.font });
    ctx.y -= 14;
  }

  // Footer area: rule + page-count line + [Turn over
  const footerY = MARGIN + 28;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 18 },
    end: { x: PAGE_W - MARGIN, y: footerY + 18 },
    thickness: 0.6,
    color: rgb(0.4, 0.4, 0.4),
  });
  const pageCountPlaceholder = "This document has  __ pages.";
  const pcW = ctx.font.widthOfTextAtSize(pageCountPlaceholder, 10);
  const pcX = (PAGE_W - pcW) / 2;
  // We draw the final string later once we know the count; capture the
  // location so the caller can overlay the real number.
  page.drawText("[Turn over", {
    x: PAGE_W - MARGIN - ctx.bold.widthOfTextAtSize("[Turn over", 10),
    y: footerY - 6,
    size: 10,
    font: ctx.bold,
  });

  return { page, pageCountY: footerY, pageCountX: pcX };
}


function exTitle(num: number) {
  return `Oefening ${num}`;
}

async function renderPaper(ctx: Ctx, p: FullPaper, supabaseAdmin: SupabaseAdminLike) {
  for (let exi = 0; exi < p.exercises.length; exi++) {
    const ex = p.exercises[exi];
    if (exi > 0) newPage(ctx);
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
    for (let qi = 0; qi < sortedQs.length; qi++) {
      const q = sortedQs[qi];
      const opts = [...q.question_options].sort((a, b) => a.letter.localeCompare(b.letter));
      const hasImages = opts.some((o) => o.image_prompt);

      // --- Pre-measure so the whole sub-question stays on one page ---
      const stemSize = 10.5;
      const stemLH = 13;
      const stemLines = wrap(ctx.bold, `Vraag ${q.number}.  ${q.stem}`, stemSize, CONTENT_W);
      const stemH = stemLines.length * stemLH;

      const CHECKBOX = 14; // size of the answer block
      const MARKS_H = 14;
      let blockH = stemH + 8; // stem + small gap below stem

      const cols = opts.length;
      const COL_GAP = 12;
      const colW = hasImages ? (CONTENT_W - (cols - 1) * COL_GAP) / cols : 0;
      const imgH = hasImages ? colW : 0;

      if (hasImages) {
        blockH += imgH + 10 /*letter row gap*/ + 14 /*letter*/ + 6 + CHECKBOX + MARKS_H;
      } else {
        // each option line: text + right-aligned checkbox, with breathing room
        const OPT_ROW = Math.max(CHECKBOX, 14) + 10; // 24pt per option
        blockH += opts.length * OPT_ROW + MARKS_H;
      }
      const INTER_Q_GAP = 14;

      // Guarantee no mid-question page break (unless the block alone exceeds a page).
      if (blockH < PAGE_H - MARGIN * 2) {
        ensure(ctx, blockH);
      }
      gap(ctx, qi === 0 ? 4 : INTER_Q_GAP);

      // Stem
      drawText(ctx, `Vraag ${q.number}.  ${q.stem}`, { size: stemSize, font: ctx.bold, lineGap: stemLH - stemSize });
      gap(ctx, 4);

      if (hasImages) {
        const rowTop = ctx.y;
        for (let i = 0; i < opts.length; i++) {
          const o = opts[i];
          const x = MARGIN + i * (colW + COL_GAP);
          // border
          ctx.page.drawRectangle({
            x,
            y: rowTop - imgH,
            width: colW,
            height: imgH,
            borderColor: rgb(0.55, 0.5, 0.4),
            borderWidth: 0.6,
          });
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
          // Letter centred under image
          const letterY = rowTop - imgH - 18;
          const letterW = ctx.bold.widthOfTextAtSize(o.letter, 11);
          ctx.page.drawText(o.letter, {
            x: x + (colW - letterW) / 2,
            y: letterY,
            size: 11,
            font: ctx.bold,
          });
          // Optional caption under letter (if there's also a text label)
          if (o.text) {
            const cap = sanitize(o.text);
            const capW = ctx.font.widthOfTextAtSize(cap, 9);
            ctx.page.drawText(cap, {
              x: x + Math.max(0, (colW - capW) / 2),
              y: letterY - 11,
              size: 9,
              font: ctx.font,
              color: rgb(0.25, 0.25, 0.3),
            });
          }
          // Checkbox centred below letter
          const boxX = x + (colW - CHECKBOX) / 2;
          const boxY = letterY - (o.text ? 16 : 6) - CHECKBOX;
          ctx.page.drawRectangle({
            x: boxX,
            y: boxY,
            width: CHECKBOX,
            height: CHECKBOX,
            borderColor: rgb(0.15, 0.15, 0.2),
            borderWidth: 0.9,
          });
        }
        ctx.y = rowTop - imgH - 18 /*letter*/ - (opts.some((o) => o.text) ? 16 : 6) - CHECKBOX - 6;
        // [1] marks indicator right-aligned
        const marksW = ctx.font.widthOfTextAtSize("[1]", 9.5);
        ctx.page.drawText("[1]", {
          x: PAGE_W - MARGIN - marksW,
          y: ctx.y - 10,
          size: 9.5,
          font: ctx.font,
          color: rgb(0.3, 0.3, 0.35),
        });
        ctx.y -= MARKS_H;
      } else {
        // Text MCQ — letter + text on the left, checkbox right-aligned.
        const OPT_ROW = Math.max(CHECKBOX, 14) + 10;
        const labelX = MARGIN + 18;
        const textX = labelX + 18;
        const boxX = PAGE_W - MARGIN - CHECKBOX;
        const textMaxW = boxX - 12 - textX;
        for (const o of opts) {
          const rowTop = ctx.y;
          // Letter
          ctx.page.drawText(o.letter, {
            x: labelX,
            y: rowTop - 11,
            size: 10.5,
            font: ctx.bold,
          });
          // Text (wrap if needed)
          const lines = wrap(ctx.font, o.text ?? "", 10.5, textMaxW);
          let ty = rowTop - 11;
          for (const ln of lines) {
            ctx.page.drawText(ln, { x: textX, y: ty, size: 10.5, font: ctx.font });
            ty -= 13;
          }
          // Checkbox vertically centred against first line
          ctx.page.drawRectangle({
            x: boxX,
            y: rowTop - 13,
            width: CHECKBOX,
            height: CHECKBOX,
            borderColor: rgb(0.15, 0.15, 0.2),
            borderWidth: 0.9,
          });
          ctx.y -= Math.max(OPT_ROW, (lines.length - 1) * 13 + OPT_ROW);
        }
        // [1] marks
        const marksW = ctx.font.widthOfTextAtSize("[1]", 9.5);
        ctx.page.drawText("[1]", {
          x: PAGE_W - MARGIN - marksW,
          y: ctx.y - 10,
          size: 9.5,
          font: ctx.font,
          color: rgb(0.3, 0.3, 0.35),
        });
        ctx.y -= MARKS_H;
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

// ---------------------------------------------------------------------------
// Transcript — matches the Cambridge specimen layout (R1 narrator cues,
// PAUSE markers, * / ** repeat brackets, exercise/question link sentences).
// ---------------------------------------------------------------------------

const NARRATOR_X = MARGIN;
const BODY_X = MARGIN + 26;
const NARRATOR_LABEL_W = 22;

function drawNarratorLine(ctx: Ctx, text: string, opts: { bold?: boolean } = {}) {
  ensure(ctx, 14);
  gap(ctx, 2);
  // "R1" cue
  ctx.page.drawText("R1", {
    x: NARRATOR_X,
    y: ctx.y - 10,
    size: 10,
    font: ctx.bold,
    color: rgb(0.15, 0.2, 0.35),
  });
  const lines = wrap(opts.bold ? ctx.bold : ctx.font, text, 10.5, CONTENT_W - NARRATOR_LABEL_W);
  const lh = 12.5;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) ensure(ctx, lh);
    ctx.page.drawText(lines[i], {
      x: NARRATOR_X + NARRATOR_LABEL_W,
      y: ctx.y - 10,
      size: 10.5,
      font: opts.bold ? ctx.bold : ctx.font,
      color: rgb(0.1, 0.12, 0.2),
    });
    ctx.y -= lh;
  }
  gap(ctx, 2);
}

function drawPause(ctx: Ctx, label: string) {
  ensure(ctx, 14);
  gap(ctx, 2);
  ctx.page.drawText(`PAUSE  ${label}`, {
    x: BODY_X,
    y: ctx.y - 10,
    size: 9.5,
    font: ctx.bold,
    color: rgb(0.4, 0.3, 0.2),
  });
  ctx.y -= 12;
  gap(ctx, 2);
}

function drawRepeat(ctx: Ctx) {
  ensure(ctx, 14);
  gap(ctx, 2);
  ctx.page.drawText("REPEAT FROM * TO **", {
    x: BODY_X,
    y: ctx.y - 10,
    size: 9.5,
    font: ctx.bold,
    color: rgb(0.4, 0.3, 0.2),
  });
  ctx.y -= 12;
  gap(ctx, 2);
}

function drawSpeakerCue(ctx: Ctx, text: string) {
  ensure(ctx, 12);
  const lines = wrap(ctx.italic, text, 9.5, CONTENT_W - (BODY_X - MARGIN));
  for (const ln of lines) {
    ensure(ctx, 11);
    ctx.page.drawText(ln, {
      x: BODY_X,
      y: ctx.y - 9,
      size: 9.5,
      font: ctx.italic,
      color: rgb(0.35, 0.35, 0.4),
    });
    ctx.y -= 11;
  }
}

function drawDialogTurn(
  ctx: Ctx,
  label: string,
  text: string,
  marks: { open?: boolean; close?: boolean },
) {
  const labelStr = `${label}:`;
  const open = marks.open ? "* " : "";
  const close = marks.close ? " **" : "";
  const body = `${open}${text}${close}`;
  ensure(ctx, 14);
  gap(ctx, 1);
  // label
  ctx.page.drawText(labelStr, {
    x: BODY_X,
    y: ctx.y - 10,
    size: 10.5,
    font: ctx.bold,
    color: rgb(0.15, 0.15, 0.2),
  });
  const indent = BODY_X + Math.max(18, ctx.bold.widthOfTextAtSize(labelStr, 10.5) + 6);
  const lines = wrap(ctx.font, body, 10.5, PAGE_W - MARGIN - indent);
  const lh = 12.5;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) ensure(ctx, lh);
    ctx.page.drawText(lines[i], {
      x: indent,
      y: ctx.y - 10,
      size: 10.5,
      font: ctx.font,
      color: rgb(0.1, 0.12, 0.2),
    });
    ctx.y -= lh;
  }
  gap(ctx, 1);
}

type ScriptTurn = FullPaper["exercises"][number]["listening_scripts"][number];

function groupByItem(scripts: ScriptTurn[]): ScriptTurn[][] {
  const sorted = [...scripts].sort((a, b) => a.sequence - b.sequence);
  const groups = new Map<number, ScriptTurn[]>();
  for (const s of sorted) {
    const k = s.item_index ?? 0;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  return [...groups.keys()].sort((a, b) => a - b).map((k) => groups.get(k)!);
}

function uniqueSpeakers(turns: ScriptTurn[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of turns) {
    const l = (t.speaker_label ?? "").trim();
    if (!l || seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out;
}

function drawTurns(ctx: Ctx, turns: ScriptTurn[]) {
  for (let i = 0; i < turns.length; i++) {
    drawDialogTurn(
      ctx,
      turns[i].speaker_label ?? "",
      turns[i].transcript,
      { open: i === 0, close: i === turns.length - 1 },
    );
  }
}

function renderTranscriptCover(ctx: Ctx, a: FullPaper["assessment"]) {
  ctx.y = PAGE_H - MARGIN - 30;
  ctx.page.drawText("Cambridge IGCSE", {
    x: MARGIN,
    y: ctx.y,
    size: 11,
    font: ctx.bold,
    color: rgb(0.15, 0.2, 0.35),
  });
  ctx.y -= 26;
  drawText(ctx, "AFRIKAANS AS A SECOND LANGUAGE", { size: 16, font: ctx.bold });
  drawText(ctx, `${a.paper_code}`, { size: 11, color: rgb(0.35, 0.35, 0.4) });
  gap(ctx, 4);
  drawText(ctx, "Paper 2 Listening", { size: 12, font: ctx.bold });
  drawText(ctx, "For examination from 2025", { size: 10, color: rgb(0.35, 0.35, 0.4) });
  gap(ctx, 16);
  drawText(ctx, "TRANSCRIPT", { size: 13, font: ctx.bold });
  drawText(ctx, "Approximately 50 minutes (including 6 minutes' transfer time)", {
    size: 10,
    font: ctx.italic,
    color: rgb(0.35, 0.35, 0.4),
  });
  gap(ctx, 18);
  rule(ctx);
}

function renderTranscript(ctx: Ctx, p: FullPaper) {
  renderTranscriptCover(ctx, p.assessment);
  drawNarratorLine(
    ctx,
    `Cambridge Assessment International Education, Cambridge IGCSE Afrikaans as a Second Language, ${p.assessment.paper_code}, Paper 2, Listening.`,
  );
  drawNarratorLine(ctx, "[BEEP]");

  for (let i = 0; i < p.exercises.length; i++) {
    const ex = p.exercises[i];
    const nextEx = p.exercises[i + 1];
    renderTranscriptExercise(ctx, ex);

    gap(ctx, 4);
    if (nextEx) {
      drawNarratorLine(
        ctx,
        `Hierdie is die einde van oefening ${ex.number}. Gaan nou na oefening ${nextEx.number}.`,
        { bold: true },
      );
      drawPause(ctx, "00'05\"");
    } else {
      drawNarratorLine(
        ctx,
        "Hierdie is die einde van die toets. Jy het nou vyf minute om jou antwoorde na die antwoordblad oor te dra.",
        { bold: true },
      );
      drawPause(ctx, "05'00\"");
      drawNarratorLine(ctx, "Jy het nou een minuut oor.");
      drawPause(ctx, "01'00\"");
      drawNarratorLine(ctx, "Sit nou jou penne neer. Dit is die einde van die eksamen.", { bold: true });
    }
  }
}

function renderTranscriptExercise(ctx: Ctx, ex: FullPaper["exercises"][number]) {
  ensure(ctx, 30);
  gap(ctx, 8);
  drawNarratorLine(ctx, `Oefening ${ex.number}`, { bold: true });
  if (ex.rubric) drawNarratorLine(ctx, ex.rubric);

  const groups = groupByItem(ex.listening_scripts);
  const qs = [...ex.questions].sort((a, b) => a.number - b.number);

  switch (ex.kind) {
    case "mcq_picture": {
      // One item per question; 3s pre-pause, 5s + REPEAT + 5s after each.
      for (let i = 0; i < groups.length; i++) {
        const q = qs[i];
        if (q) {
          drawNarratorLine(ctx, `Vraag ${q.number}`, { bold: true });
          drawNarratorLine(ctx, q.stem);
        }
        drawPause(ctx, "00'03\"");
        const speakers = uniqueSpeakers(groups[i]);
        for (const s of speakers) drawSpeakerCue(ctx, `${s}`);
        drawTurns(ctx, groups[i]);
        drawPause(ctx, "00'05\"");
        drawRepeat(ctx);
        drawPause(ctx, "00'05\"");
      }
      break;
    }
    case "mcq_text_pair": {
      // Each item drives two questions; 15s reading pause, then 5s/REPEAT/5s.
      drawPause(ctx, "00'05\"");
      for (let i = 0; i < groups.length; i++) {
        const qA = qs[i * 2];
        const qB = qs[i * 2 + 1];
        if (qA && qB) {
          drawNarratorLine(ctx, `Kyk nou na vraag ${qA.number} en ${qB.number}.`, { bold: true });
        }
        drawPause(ctx, "00'15\"");
        const speakers = uniqueSpeakers(groups[i]);
        for (const s of speakers) drawSpeakerCue(ctx, `${s}`);
        drawTurns(ctx, groups[i]);
        drawPause(ctx, "00'05\"");
        drawRepeat(ctx);
        drawPause(ctx, "00'05\"");
      }
      break;
    }
    case "mcq_long": {
      const first = qs[0]?.number;
      const last = qs[qs.length - 1]?.number;
      if (first && last) {
        drawNarratorLine(ctx, `Kyk nou na vrae ${first}–${last}.`, { bold: true });
      }
      drawPause(ctx, ex.number === 3 ? "00'40\"" : "00'45\"");
      const all = groups.flat();
      const speakers = uniqueSpeakers(all);
      for (const s of speakers) drawSpeakerCue(ctx, `${s}`);
      drawTurns(ctx, all);
      drawPause(ctx, "00'10\"");
      drawNarratorLine(
        ctx,
        ex.number === 3
          ? "Jy sal die praatjie nou nog 'n keer hoor."
          : "Jy sal die onderhoud nou nog een keer hoor.",
      );
      drawRepeat(ctx);
      drawPause(ctx, "00'10\"");
      break;
    }
    case "matching": {
      drawNarratorLine(ctx, "Lees nou stellings A–H.");
      drawPause(ctx, "00'30\"");
      for (let i = 0; i < groups.length; i++) {
        drawNarratorLine(ctx, `Spreker ${i + 1}`, { bold: true });
        const speakers = uniqueSpeakers(groups[i]);
        for (const s of speakers) drawSpeakerCue(ctx, `${s}`);
        drawTurns(ctx, groups[i]);
        drawPause(ctx, "00'10\"");
      }
      drawNarratorLine(ctx, "Nou sal jy weer na die ses tieners luister.");
      drawRepeat(ctx);
      drawPause(ctx, "00'10\"");
      break;
    }
    default: {
      // Fallback: dump turns as a single block
      const all = groups.flat();
      const speakers = uniqueSpeakers(all);
      for (const s of speakers) drawSpeakerCue(ctx, `${s}`);
      drawTurns(ctx, all);
    }
  }
}

// ---------------------------------------------------------------------------
// Storage image fetcher
// ---------------------------------------------------------------------------

type StorageBucket = {
  download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
  upload: (
    path: string,
    body: Uint8Array,
    opts?: { upsert?: boolean; contentType?: string },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
    opts?: { download?: string | boolean },
  ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
};
type SupabaseAdminLike = {
  storage: { from: (bucket: string) => StorageBucket };
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
      .select("id,title,paper_code,level,status,paper_pdf_path,mark_scheme_pdf_path,transcript_pdf_path,school_logo_path,date_of_assessment")
      .eq("id", data.assessment_id)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!aRaw) throw new Error("Assessment not found");
    const aFull = aRaw as FullPaper["assessment"] & {
      paper_pdf_path: string | null;
      mark_scheme_pdf_path: string | null;
      transcript_pdf_path: string | null;
      school_logo_path: string | null;
      date_of_assessment: string | null;
    };
    const a = aFull as FullPaper["assessment"];


    const safeTitle = aFull.title.replace(/[^\w\-]+/g, "_").slice(0, 60);
    const suffix = { paper: "vraestel", mark_scheme: "memorandum", transcript: "transkripsie" }[data.kind];
    const filename = `${safeTitle}_${suffix}.pdf`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseAdminLike & {
      storage: SupabaseAdminLike["storage"] & {
        from: (b: string) => {
          download: (p: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
          upload: (
            p: string,
            body: Uint8Array,
            opts?: { upsert?: boolean; contentType?: string },
          ) => Promise<{ data: unknown; error: { message: string } | null }>;
          createSignedUrl: (
            p: string,
            expiresIn: number,
            opts?: { download?: string | boolean },
          ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
        };
      };
      from: (t: string) => {
        update: (v: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
      };
    };

    // Cache hit: return signed URL without regenerating.
    const cachedPath = aFull[PATH_COL[data.kind]];
    if (!data.force && cachedPath) {
      const { data: signed, error: sErr } = await admin.storage
        .from("paper-pdfs")
        .createSignedUrl(cachedPath, 60 * 60, { download: filename });
      if (!sErr && signed?.signedUrl) {
        return { filename, mime: "application/pdf", download_url: signed.signedUrl, cached: true };
      }
      // fall through and regenerate if signed URL failed
    }

    const { data: exsRaw, error: exErr } = await supabase
      .from("exercises")
      .select(
        "id,number,kind,rubric,statements,questions(id,number,stem,correct_letter,speaker_index,question_options(id,letter,text,image_prompt)),listening_scripts(sequence,speaker_label,transcript,item_index)",
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

    const isPaper = data.kind === "paper";
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
    if (!isPaper) drawPageHeader(ctx);

    let coverHandles: CoverHandles | null = null;
    if (isPaper) {
      // Load school logo bytes (if uploaded).
      let logoBytes: Uint8Array | null = null;
      if (aFull.school_logo_path) {
        try {
          const { data: logoBlob } = await admin.storage.from("paper-logos").download(aFull.school_logo_path);
          if (logoBlob) logoBytes = new Uint8Array(await logoBlob.arrayBuffer());
        } catch { /* ignore */ }
      }
      coverHandles = await renderPaperCover(ctx, aFull, logoBytes);
      // Start exercises on a fresh page
      newPage(ctx);
    } else if (data.kind === "mark_scheme") {
      await renderCover(ctx, a, kindLabel[data.kind]);
    }

    if (data.kind === "paper") {
      await renderPaper(ctx, paper, admin as unknown as SupabaseAdminLike);
    } else if (data.kind === "mark_scheme") {
      renderMarkScheme(ctx, paper);
    } else {
      renderTranscript(ctx, paper);
    }

    // Overlay the page count on the cover now that the document is fully laid out.
    if (coverHandles) {
      const total = doc.getPageCount();
      const txt = `This document has ${total} pages.`;
      const w = bold.widthOfTextAtSize(txt, 10);
      coverHandles.page.drawText(txt, {
        x: (PAGE_W - w) / 2,
        y: coverHandles.pageCountY,
        size: 10,
        font: bold,
      });
    }

    const bytes = await doc.save();


    // Upload to storage so the user can re-download without regenerating.
    const storagePath = `${a.id}/${data.kind}.pdf`;
    const { error: upErr } = await admin.storage
      .from("paper-pdfs")
      .upload(storagePath, bytes, { upsert: true, contentType: "application/pdf" });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { error: updErr } = await admin
      .from("assessments")
      .update({ [PATH_COL[data.kind]]: storagePath, [STAMP_COL[data.kind]]: new Date().toISOString() })
      .eq("id", a.id);
    if (updErr) throw new Error(updErr.message);

    const { data: signed, error: sErr } = await admin.storage
      .from("paper-pdfs")
      .createSignedUrl(storagePath, 60 * 60, { download: filename });
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "Signed URL failed");

    return { filename, mime: "application/pdf", download_url: signed.signedUrl, cached: false };
  });
