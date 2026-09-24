import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  PositionalTab,
  PositionalTabAlignment,
  PositionalTabLeader,
  PositionalTabRelativeTo,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type FileChild,
  type ParagraphChild,
} from "docx";
import { PNG } from "pngjs";

type DocxKind = "paper" | "transcript";

const Input = z.object({
  assessment_id: z.string().uuid(),
  kind: z.enum(["paper", "transcript"]),
});

type FullPaper = {
  assessment: {
    id: string;
    title: string;
    paper_code: string;
    level: string;
    status: string;
    school_logo_path: string | null;
    date_of_assessment: string | null;
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
        image_zoom: number;
        image_offset_x: number;
        image_offset_y: number;
      }[];
    }[];
    listening_scripts: {
      sequence: number;
      speaker_label: string | null;
      transcript: string;
      item_index: number | null;
      role_gloss: string | null;
      context: string | null;
    }[];
  }[];
};

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

type StorageClient = { storage: { from: (bucket: string) => StorageBucket } };
type ScriptTurn = FullPaper["exercises"][number]["listening_scripts"][number];

const A4_W = 11906;
const A4_H = 16838;
const MARGIN = 1000;
const CONTENT_W = A4_W - MARGIN * 2;
const FONT = "Arial";
const INK = "1A1F33";
const MUTED = "595966";
const ACCENT = "263354";
const WARM = "66513A";
const THIN = { style: BorderStyle.SINGLE, size: 4, color: "333338" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

function run(text: string, options: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: options.size ?? 20,
    bold: options.bold,
    italics: options.italics,
    color: options.color ?? INK,
  });
}

function paragraph(
  children: ParagraphChild[] | string,
  options: {
    before?: number;
    after?: number;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    keepNext?: boolean;
    keepLines?: boolean;
    indentLeft?: number;
    hanging?: number;
    pageBreakBefore?: boolean;
  } = {},
) {
  return new Paragraph({
    children: typeof children === "string" ? [run(children)] : children,
    alignment: options.alignment,
    keepNext: options.keepNext,
    keepLines: options.keepLines,
    pageBreakBefore: options.pageBreakBefore,
    indent: options.indentLeft || options.hanging
      ? { left: options.indentLeft ?? 0, hanging: options.hanging }
      : undefined,
    spacing: { before: options.before ?? 0, after: options.after ?? 80, line: 240 },
  });
}

function heading(text: string, size: number, options: { before?: number; after?: number; pageBreakBefore?: boolean } = {}) {
  return paragraph([run(text, { bold: true, size })], {
    before: options.before,
    after: options.after ?? 100,
    keepNext: true,
    pageBreakBefore: options.pageBreakBefore,
  });
}

function ruleParagraph() {
  return new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 5, color: "777777", space: 1 } },
    spacing: { before: 100, after: 140 },
  });
}

function header(title: string, paperCode: string) {
  return new Header({
    children: [
      new Paragraph({
        children: [
          run(title, { bold: true, size: 16, color: MUTED }),
          new PositionalTab({
            alignment: PositionalTabAlignment.RIGHT,
            relativeTo: PositionalTabRelativeTo.MARGIN,
            leader: PositionalTabLeader.NONE,
          }),
          run(paperCode, { size: 16, color: MUTED }),
        ],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "B3B3B3", space: 5 } },
        spacing: { after: 100 },
      }),
    ],
  });
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run("Page ", { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })],
      }),
    ],
  });
}

function bullet(text: string, reference: string) {
  return new Paragraph({
    numbering: { reference, level: 0 },
    children: [run(text)],
    spacing: { after: 50, line: 240 },
  });
}

function imageType(bytes: Uint8Array): "png" | "jpg" {
  return bytes[0] === 0x89 && bytes[1] === 0x50 ? "png" : "jpg";
}

async function downloadBytes(client: StorageClient, bucket: string, path: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

function cropOptionImage(bytes: Uint8Array, zoomValue: number, offsetXValue: number, offsetYValue: number) {
  try {
    const source = PNG.sync.read(Buffer.from(bytes));
    const size = Math.min(480, Math.max(360, Math.min(source.width, source.height)));
    const target = new PNG({ width: size, height: size, colorType: 6 });
    const zoom = Math.min(2.25, Math.max(1, zoomValue || 1.32));
    const offsetX = Math.min(0.4, Math.max(-0.4, offsetXValue || 0));
    const offsetY = Math.min(0.4, Math.max(-0.4, offsetYValue || 0));
    const fit = Math.min(size / source.width, size / source.height) * zoom;
    const drawnW = source.width * fit;
    const drawnH = source.height * fit;
    const originX = (size - drawnW) / 2 + offsetX * size;
    const originY = (size - drawnH) / 2 + offsetY * size;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const outIndex = (y * size + x) * 4;
        const sx = Math.floor((x - originX) / fit);
        const sy = Math.floor((y - originY) / fit);
        if (sx >= 0 && sx < source.width && sy >= 0 && sy < source.height) {
          const inIndex = (sy * source.width + sx) * 4;
          const alpha = source.data[inIndex + 3] / 255;
          target.data[outIndex] = Math.round(source.data[inIndex] * alpha + 255 * (1 - alpha));
          target.data[outIndex + 1] = Math.round(source.data[inIndex + 1] * alpha + 255 * (1 - alpha));
          target.data[outIndex + 2] = Math.round(source.data[inIndex + 2] * alpha + 255 * (1 - alpha));
          target.data[outIndex + 3] = 255;
        } else {
          target.data[outIndex] = 255;
          target.data[outIndex + 1] = 255;
          target.data[outIndex + 2] = 255;
          target.data[outIndex + 3] = 255;
        }
      }
    }
    return new Uint8Array(PNG.sync.write(target));
  } catch {
    return bytes;
  }
}

async function paperCover(paper: FullPaper, storage: StorageClient): Promise<FileChild[]> {
  const a = paper.assessment;
  const children: FileChild[] = [];
  if (a.school_logo_path) {
    const logo = await downloadBytes(storage, "paper-logos", a.school_logo_path);
    if (logo) {
      children.push(new Paragraph({
        children: [new ImageRun({
          type: imageType(logo),
          data: logo,
          transformation: { width: 150, height: 100 },
          altText: { title: "School logo", description: "School logo", name: "School logo" },
        })],
        spacing: { after: 300 },
      }));
    }
  }
  if (!children.length) children.push(paragraph([run("School logo goes here", { size: 18, color: MUTED })], { after: 760 }));

  children.push(
    heading("Afrikaans Tweede Taal", 44, { after: 240 }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [7000, CONTENT_W - 7000],
      borders: NO_BORDERS,
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: 7000, type: WidthType.DXA }, borders: NO_BORDERS, children: [paragraph([run("AFRIKAANS AS A SECOND LANGUAGE", { bold: true, size: 24 })], { after: 0 })] }),
        new TableCell({ width: { size: CONTENT_W - 7000, type: WidthType.DXA }, borders: NO_BORDERS, children: [paragraph([run(a.paper_code, { bold: true, size: 24 })], { alignment: AlignmentType.RIGHT, after: 0 })] }),
      ] })],
    }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [4400, CONTENT_W - 4400],
      borders: NO_BORDERS,
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: 4400, type: WidthType.DXA }, borders: NO_BORDERS, children: [paragraph("Paper 2 Listening", { after: 0 })] }),
        new TableCell({ width: { size: CONTENT_W - 4400, type: WidthType.DXA }, borders: NO_BORDERS, children: [paragraph([run(a.date_of_assessment ? `Date of assessment: ${a.date_of_assessment}` : "", { bold: true })], { alignment: AlignmentType.RIGHT, after: 0 })] }),
      ] })],
    }),
    paragraph([run("Approximately 50 minutes (including 6 minutes' transfer time)", { bold: true })], { alignment: AlignmentType.RIGHT, after: 280 }),
    paragraph("You must transfer your answers onto the multiple choice answer sheet.", { after: 180 }),
    paragraph([run("You will need:", { size: 20 }), run("    Multiple choice answer sheet\n    Soft clean eraser\n    Soft pencil (type B or HB is recommended)", { size: 20 })], { after: 160 }),
    ruleParagraph(),
    heading("INSTRUCTIONS", 22),
  );
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
  children.push(...instructions.map((text) => bullet(text, "paper-bullets")));
  children.push(ruleParagraph(), heading("INFORMATION", 22));
  children.push(...[
    "The total mark for this paper is 40.",
    "Each correct answer will score one mark.",
    "Any rough working should be done on this question paper.",
  ].map((text) => bullet(text, "paper-info-bullets")));
  children.push(paragraph([run("[Turn over", { bold: true })], { alignment: AlignmentType.RIGHT, before: 300 }));
  return children;
}

function emptyAnswerBox() {
  return new TableCell({
    width: { size: 420, type: WidthType.DXA },
    borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
    verticalAlign: VerticalAlign.CENTER,
    children: [paragraph(" ", { after: 0 })],
  });
}

function marksCell() {
  return new TableCell({
    width: { size: 500, type: WidthType.DXA },
    borders: NO_BORDERS,
    children: [paragraph("[1]", { alignment: AlignmentType.RIGHT, after: 0 })],
  });
}

async function pictureQuestion(
  paper: FullPaper,
  question: FullPaper["exercises"][number]["questions"][number],
  storage: StorageClient,
) {
  const options = [...question.question_options].sort((a, b) => a.letter.localeCompare(b.letter));
  const gap = 120;
  const colW = Math.floor((CONTENT_W - gap * (options.length - 1)) / options.length);
  const rows: TableRow[] = [];
  const cells: TableCell[] = [];
  for (const option of options) {
    const raw = await downloadBytes(storage, "option-images", `${paper.assessment.id}/${option.id}.png`);
    const image = raw ? cropOptionImage(raw, option.image_zoom, option.image_offset_x, option.image_offset_y) : null;
    const imagePx = Math.max(130, Math.floor((colW / 1440) * 96) - 10);
    const content: Paragraph[] = [];
    if (image) {
      content.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          type: "png",
          data: image,
          transformation: { width: imagePx, height: imagePx },
          altText: { title: option.letter, description: option.image_prompt ?? option.letter, name: `Option ${option.letter}` },
        })],
        spacing: { after: 70 },
      }));
    } else {
      content.push(paragraph([run(option.image_prompt ?? "Image", { italics: true, size: 14, color: MUTED })], { alignment: AlignmentType.CENTER, after: 70 }));
    }
    content.push(paragraph([run(option.letter, { bold: true, size: 22 })], { alignment: AlignmentType.CENTER, after: 20 }));
    if (option.text) content.push(paragraph(option.text, { alignment: AlignmentType.CENTER, after: 20 }));
    content.push(paragraph("□", { alignment: AlignmentType.CENTER, after: 0 }));
    cells.push(new TableCell({
      width: { size: colW, type: WidthType.DXA },
      borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
      margins: { top: 70, bottom: 70, left: 70, right: 70 },
      verticalAlign: VerticalAlign.CENTER,
      children: content,
    }));
  }
  rows.push(new TableRow({ children: cells, cantSplit: true }));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: options.map(() => colW),
    layout: TableLayoutType.FIXED,
    rows,
  });
}

function textQuestion(question: FullPaper["exercises"][number]["questions"][number]) {
  const rows = [...question.question_options]
    .sort((a, b) => a.letter.localeCompare(b.letter))
    .map((option) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ width: { size: 500, type: WidthType.DXA }, borders: NO_BORDERS, children: [paragraph([run(option.letter, { bold: true, size: 21 })], { after: 0 })] }),
        new TableCell({ width: { size: CONTENT_W - 1420, type: WidthType.DXA }, borders: NO_BORDERS, children: [paragraph(option.text ?? "", { after: 0 })] }),
        emptyAnswerBox(),
        marksCell(),
      ],
    }));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [500, CONTENT_W - 1420, 420, 500],
    borders: NO_BORDERS,
    rows,
  });
}

function matchingExercise(exercise: FullPaper["exercises"][number]) {
  const statements = exercise.statements as { letter: string; text: string }[];
  const rows = statements.map((statement) => new TableRow({
    cantSplit: true,
    children: [
      new TableCell({ width: { size: 650, type: WidthType.DXA }, borders: { top: THIN, bottom: THIN, left: THIN, right: THIN }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, verticalAlign: VerticalAlign.CENTER, children: [paragraph([run(statement.letter, { bold: true })], { after: 0 })] }),
      new TableCell({ width: { size: CONTENT_W - 650, type: WidthType.DXA }, borders: { top: THIN, bottom: THIN, left: THIN, right: THIN }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, verticalAlign: VerticalAlign.CENTER, children: [paragraph(statement.text, { after: 0 })] }),
    ],
  }));
  const output: FileChild[] = [
    heading("Lees nou stellings A–H.", 21, { after: 100 }),
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [650, CONTENT_W - 650], layout: TableLayoutType.FIXED, rows }),
  ];
  const questions = [...exercise.questions].sort((a, b) => a.number - b.number);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const speaker = q.speaker_index ?? i + 1;
    output.push(new Paragraph({
      children: [
        run(`Vraag ${q.number}`, { bold: true, size: 21 }),
        run(`    Spreker ${speaker}    `, { size: 21 }),
        new PositionalTab({ alignment: PositionalTabAlignment.RIGHT, relativeTo: PositionalTabRelativeTo.MARGIN, leader: PositionalTabLeader.DOT }),
        run("    [1]", { size: 19, color: MUTED }),
      ],
      spacing: { before: 170, after: 170 },
      keepLines: true,
    }));
  }
  output.push(paragraph([run(`[Totaal: ${questions.length}]`, { bold: true, size: 19 })], { alignment: AlignmentType.RIGHT }));
  return output;
}

async function renderPaper(paperData: FullPaper, storage: StorageClient) {
  const children = await paperCover(paperData, storage);
  children.push(new Paragraph({ children: [new PageBreak()] }));
  for (let exerciseIndex = 0; exerciseIndex < paperData.exercises.length; exerciseIndex++) {
    const exercise = paperData.exercises[exerciseIndex];
    if (exerciseIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      heading(`Oefening ${exercise.number}`, 28, { after: 50 }),
      paragraph([run(exercise.rubric, { size: 20, color: MUTED })], { after: 180, keepNext: true }),
    );
    const statements = Array.isArray(exercise.statements) ? exercise.statements as { letter: string; text: string }[] : null;
    if (exercise.kind === "matching" && statements?.length) {
      children.push(...matchingExercise(exercise), ruleParagraph());
      continue;
    }
    if (statements?.length) {
      for (const statement of statements) children.push(paragraph([run(statement.letter, { bold: true }), run(`  ${statement.text}`)], { indentLeft: 280 }));
    }
    for (const question of [...exercise.questions].sort((a, b) => a.number - b.number)) {
      children.push(heading(`Vraag ${question.number}.  ${question.stem}`, 21, { before: 180, after: 100 }));
      const hasImages = question.question_options.some((option) => option.image_prompt);
      children.push(hasImages ? await pictureQuestion(paperData, question, storage) : textQuestion(question));
    }
    children.push(ruleParagraph());
  }
  return children;
}

function narrator(text: string, bold = false) {
  return new Paragraph({
    children: [run("R1", { bold: true, size: 20, color: ACCENT }), run(`    ${text}`, { bold, size: 21 })],
    indent: { left: 520, hanging: 520 },
    spacing: { before: 40, after: 70, line: 250 },
    keepLines: true,
  });
}

function pause(label: string) {
  return paragraph([run(`PAUSE  ${label}`, { bold: true, size: 19, color: WARM })], { indentLeft: 520, before: 40, after: 70 });
}

function repeat() {
  return paragraph([run("REPEAT FROM * to **", { bold: true, size: 19, color: WARM })], { indentLeft: 520, before: 40, after: 70 });
}

function speakerCue(text: string) {
  return paragraph([run(text, { italics: true, size: 19, color: MUTED })], { indentLeft: 520, after: 40 });
}

function dialogTurn(turn: ScriptTurn, open: boolean, close: boolean) {
  const body = `${open ? "* " : ""}${turn.transcript}${close ? " **" : ""}`;
  const label = `${turn.speaker_label ?? ""}:`;
  return new Paragraph({
    children: [run(label, { bold: true, size: 21 }), run(`  ${body}`, { size: 21 })],
    indent: { left: 520, hanging: 0 },
    spacing: { after: 50, line: 250 },
    keepLines: true,
  });
}

function groupByItem(scripts: ScriptTurn[]) {
  const groups = new Map<number, ScriptTurn[]>();
  for (const script of [...scripts].sort((a, b) => a.sequence - b.sequence)) {
    const key = script.item_index ?? 0;
    const group = groups.get(key) ?? [];
    group.push(script);
    groups.set(key, group);
  }
  return [...groups.keys()].sort((a, b) => a - b).map((key) => groups.get(key) ?? []);
}

function uniqueSpeakerCues(turns: ScriptTurn[]) {
  const seen = new Set<string>();
  const cues: string[] = [];
  for (const turn of turns) {
    const label = (turn.speaker_label ?? "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    cues.push(turn.role_gloss?.trim() ? `${label}: ${turn.role_gloss.trim()}` : label);
  }
  return cues;
}

function turnsChildren(turns: ScriptTurn[]) {
  return turns.map((turn, index) => dialogTurn(turn, index === 0, index === turns.length - 1));
}

function transcriptExercise(exercise: FullPaper["exercises"][number]): FileChild[] {
  const output: FileChild[] = [narrator(`Oefening ${exercise.number}`, true)];
  if (exercise.rubric) output.push(narrator(exercise.rubric));
  const groups = groupByItem(exercise.listening_scripts);
  const questions = [...exercise.questions].sort((a, b) => a.number - b.number);
  if (exercise.kind === "mcq_picture") {
    for (let i = 0; i < groups.length; i++) {
      const question = questions[i];
      if (question) output.push(narrator(`Vraag ${question.number}`, true), narrator(question.stem));
      output.push(pause("00'03\""));
      output.push(...uniqueSpeakerCues(groups[i]).map(speakerCue), ...turnsChildren(groups[i]), pause("00'05\""), repeat(), pause("00'05\""));
    }
  } else if (exercise.kind === "mcq_text_pair") {
    output.push(pause("00'05\""));
    for (let i = 0; i < groups.length; i++) {
      const first = questions[i * 2];
      const second = questions[i * 2 + 1];
      const context = groups[i][0]?.context?.trim();
      if (context) output.push(narrator(context));
      if (first && second) output.push(narrator(`Kyk nou na vraag ${first.number} en ${second.number}.`, true));
      output.push(pause("00'15\""), ...uniqueSpeakerCues(groups[i]).map(speakerCue), ...turnsChildren(groups[i]), pause("00'05\""), repeat(), pause("00'05\""));
    }
  } else if (exercise.kind === "mcq_long") {
    const first = questions[0]?.number;
    const last = questions[questions.length - 1]?.number;
    if (first && last) output.push(narrator(`Kyk nou na vrae ${first}–${last}.`, true));
    output.push(pause(exercise.number === 3 ? "00'40\"" : "00'45\""));
    const all = groups.flat();
    output.push(...uniqueSpeakerCues(all).map(speakerCue), ...turnsChildren(all), pause("00'10\""));
    output.push(narrator(exercise.number === 3 ? "Jy sal die praatjie nou nog 'n keer hoor." : "Jy sal die onderhoud nou nog een keer hoor."), repeat(), pause("00'10\""));
  } else if (exercise.kind === "matching") {
    output.push(narrator("Lees nou stellings A–H."), pause("00'30\""));
    for (let i = 0; i < groups.length; i++) {
      output.push(narrator(`Spreker ${i + 1}`, true), ...uniqueSpeakerCues(groups[i]).map(speakerCue), ...turnsChildren(groups[i]), pause("00'10\""));
    }
    output.push(narrator("Nou sal jy weer na die ses tieners luister."), repeat(), pause("00'10\""));
  } else {
    const all = groups.flat();
    output.push(...uniqueSpeakerCues(all).map(speakerCue), ...turnsChildren(all));
  }
  return output;
}

function renderTranscript(paperData: FullPaper) {
  const a = paperData.assessment;
  const children: FileChild[] = [
    heading("Afrikaans Tweede Taal", 22, { after: 300 }),
    heading("AFRIKAANS AS A SECOND LANGUAGE", 32, { after: 60 }),
    paragraph([run(a.paper_code, { size: 22, color: MUTED })], { after: 100 }),
    heading("Listening — Practice paper", 24, { after: 300 }),
    heading("TRANSCRIPT", 26, { after: 60 }),
    paragraph([run("Approximately 50 minutes (including 6 minutes' transfer time)", { italics: true, color: MUTED })], { after: 300 }),
    ruleParagraph(),
    narrator(`Afrikaans as a Second Language — Listening practice paper (${a.paper_code}).`),
    narrator("[BEEP]"),
  ];
  for (let index = 0; index < paperData.exercises.length; index++) {
    const exercise = paperData.exercises[index];
    const next = paperData.exercises[index + 1];
    children.push(...transcriptExercise(exercise));
    if (next) {
      children.push(narrator(`Hierdie is die einde van oefening ${exercise.number}. Gaan nou na oefening ${next.number}.`, true), pause("00'05\""));
    } else {
      children.push(
        narrator(`Hierdie is die einde van oefening ${exercise.number}.`, true),
        narrator("Jy het nou 6 minute om jou antwoorde op die antwoordblad te skryf. Jy sal gewaarsku word wanneer daar nog net 1 minuut oor is."),
        pause("05'00\""), narrator("Daar is nou 1 minuut oor."), pause("01'00\""),
        narrator("Dit is nou die einde van hierdie vraestel.", true), narrator("This is the end of the examination.", true),
      );
    }
  }
  return children;
}

function makeDocument(paperData: FullPaper, children: FileChild[], kind: DocxKind) {
  const kindLabel = kind === "paper" ? "Vraestel 2 — Luister" : "Transkripsie";
  return new Document({
    creator: "Luister Lab",
    title: `${paperData.assessment.title} — ${kindLabel}`,
    description: kind === "paper" ? "Editable question paper" : "Editable listening transcript",
    features: { updateFields: true },
    numbering: {
      config: ["paper-bullets", "paper-info-bullets"].map((reference) => ({
        reference,
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 240 } } },
        }],
      })),
    },
    styles: {
      default: { document: { run: { font: FONT, size: 20, color: INK }, paragraph: { spacing: { line: 240 } } } },
    },
    sections: [{
      properties: {
        page: { size: { width: A4_W, height: A4_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
        titlePage: kind === "paper",
      },
      headers: { default: header(`${paperData.assessment.title} — ${kindLabel}`, paperData.assessment.paper_code) },
      footers: { default: footer() },
      children,
    }],
  });
}

export const generatePaperDocx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as {
      supabase: {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
              order: (column: string) => Promise<{ data: unknown; error: { message: string } | null }>;
            };
          };
        };
      };
    };
    const { data: assessmentRaw, error: assessmentError } = await supabase
      .from("assessments")
      .select("id,title,paper_code,level,status,school_logo_path,date_of_assessment")
      .eq("id", data.assessment_id)
      .maybeSingle();
    if (assessmentError) throw new Error(assessmentError.message);
    if (!assessmentRaw) throw new Error("Assessment not found");

    const { data: exercisesRaw, error: exercisesError } = await supabase
      .from("exercises")
      .select("id,number,kind,rubric,statements,questions(id,number,stem,correct_letter,speaker_index,question_options(id,letter,text,image_prompt,image_zoom,image_offset_x,image_offset_y)),listening_scripts(sequence,speaker_label,transcript,item_index,role_gloss,context)")
      .eq("assessment_id", data.assessment_id)
      .order("number");
    if (exercisesError) throw new Error(exercisesError.message);

    const paperData: FullPaper = {
      assessment: assessmentRaw as FullPaper["assessment"],
      exercises: ((exercisesRaw ?? []) as FullPaper["exercises"]).sort((a, b) => a.number - b.number),
    };
    if (!paperData.exercises.length) throw new Error("Geen oefeninge om uit te voer nie — genereer eers die vraestel.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const storage = supabaseAdmin as unknown as StorageClient;
    const children = data.kind === "paper" ? await renderPaper(paperData, storage) : renderTranscript(paperData);
    const doc = makeDocument(paperData, children, data.kind);
    const buffer = await Packer.toBuffer(doc);
    const bytes = new Uint8Array(buffer);
    const safeTitle = paperData.assessment.title.replace(/[^\w\-]+/g, "_").slice(0, 60);
    const suffix = data.kind === "paper" ? "vraestel" : "transkripsie";
    const filename = `${safeTitle}_${suffix}.docx`;
    const storagePath = `${paperData.assessment.id}/${data.kind}.docx`;
    const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const { error: uploadError } = await storage.storage.from("paper-pdfs").upload(storagePath, bytes, { upsert: true, contentType: mime });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    const { data: signed, error: signedError } = await storage.storage.from("paper-pdfs").createSignedUrl(storagePath, 60 * 60, { download: filename });
    if (signedError || !signed?.signedUrl) throw new Error(signedError?.message ?? "Signed URL failed");
    return { filename, mime, download_url: signed.signedUrl };
  });