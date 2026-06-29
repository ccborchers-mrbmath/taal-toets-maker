// Cambridge IGCSE Afrikaans Second Language (0548) Paper 2 Listening — domain.
// Defines exercise structure, part picker config, and the PaperScript JSON
// shape returned by the generator.

export type PartType =
  | "full_paper"
  | "exercise1"
  | "exercise2"
  | "exercise3"
  | "exercise4"
  | "exercise5";

export type ExamLevel = "core" | "extended";
export type ExerciseNum = 1 | 2 | 3 | 4 | 5;

export type PartConfig = {
  id: PartType;
  shortLabel: { af: string; en: string };
  label: { af: string; en: string };
  summary: { af: string; en: string };
  isFullPaper?: boolean;
  questionRange: [number, number];
};

export const PARTS: Record<PartType, PartConfig> = {
  full_paper: {
    id: "full_paper",
    shortLabel: { af: "Volledige vraestel", en: "Full paper" },
    label: {
      af: "Volledige vraestel — al 5 oefeninge (40 vrae)",
      en: "Full paper — all 5 exercises (40 questions)",
    },
    summary: {
      af: "Skep die volledige 0548/02 vraestel met Oefeninge 1–5 en die memorandum.",
      en: "Generates the complete 0548/02 paper with Exercises 1–5 and the mark scheme.",
    },
    isFullPaper: true,
    questionRange: [1, 40],
  },
  exercise1: {
    id: "exercise1",
    shortLabel: { af: "Oefening 1", en: "Exercise 1" },
    label: {
      af: "Oefening 1 — 8 kort opnames, prent-meerkeusig (A–D)",
      en: "Exercise 1 — 8 short recordings, picture multiple choice (A–D)",
    },
    summary: {
      af: "Agt kort opnames, elk met 'n vraag en vier prent-opsies.",
      en: "Eight short recordings, each with one question and four picture options.",
    },
    questionRange: [1, 8],
  },
  exercise2: {
    id: "exercise2",
    shortLabel: { af: "Oefening 2", en: "Exercise 2" },
    label: {
      af: "Oefening 2 — 5 kort gesprekke, twee MK-vrae elk",
      en: "Exercise 2 — 5 short dialogues, two MCQs each",
    },
    summary: {
      af: "Vyf kort gesprekke. Elke gesprek het twee meerkeusige vrae (A, B, C). 10 vrae in totaal.",
      en: "Five short dialogues. Each has two MCQs (A, B, C). 10 questions total.",
    },
    questionRange: [9, 18],
  },
  exercise3: {
    id: "exercise3",
    shortLabel: { af: "Oefening 3", en: "Exercise 3" },
    label: {
      af: "Oefening 3 — Langer praatjie, 8 MK-vrae",
      en: "Exercise 3 — Longer talk, 8 MCQs",
    },
    summary: {
      af: "Een langer monoloog (~3–4 minute). Agt MK-vrae met drie opsies (A, B, C).",
      en: "One longer monologue (~3–4 min). Eight MCQs with three options (A, B, C).",
    },
    questionRange: [19, 26],
  },
  exercise4: {
    id: "exercise4",
    shortLabel: { af: "Oefening 4", en: "Exercise 4" },
    label: {
      af: "Oefening 4 — Ses sprekers, passingstaak (A–H)",
      en: "Exercise 4 — Six speakers, matching task (A–H)",
    },
    summary: {
      af: "Ses monoloë oor 'n gedeelde tema. Pas elke spreker by een van agt stellings (A–H, twee afleiers).",
      en: "Six monologues on one shared theme. Match each to one of eight statements (A–H, two distractors).",
    },
    questionRange: [27, 32],
  },
  exercise5: {
    id: "exercise5",
    shortLabel: { af: "Oefening 5", en: "Exercise 5" },
    label: {
      af: "Oefening 5 — Lang onderhoud, 8 MK-vrae",
      en: "Exercise 5 — Long interview, 8 MCQs",
    },
    summary: {
      af: "Een langer onderhoud (~4 minute). Agt MK-vrae met drie opsies (A, B, C).",
      en: "One longer interview (~4 min). Eight MCQs with three options (A, B, C).",
    },
    questionRange: [33, 40],
  },
};

export const SELECTABLE_PARTS: PartConfig[] = [
  PARTS.full_paper,
  PARTS.exercise1,
  PARTS.exercise2,
  PARTS.exercise3,
  PARTS.exercise4,
  PARTS.exercise5,
];

export function exercisesFor(part: PartType): ExerciseNum[] {
  if (part === "full_paper") return [1, 2, 3, 4, 5];
  return [parseInt(part.replace("exercise", ""), 10) as ExerciseNum];
}

// Per-exercise guidance shown to teachers in the new-assessment form.
export const EX_GUIDE: Record<ExerciseNum, {
  slots: number;
  slotLabel: { af: string; en: string };
  perSlotPlaceholder: { af: string; en: string };
  exerciseHint: { af: string; en: string };
}> = {
  1: {
    slots: 8,
    slotLabel: { af: "Vraag", en: "Question" },
    perSlotPlaceholder: {
      af: "Bv. Foonboodskap — 'n meisie laat 'n boodskap vir haar ma oor waar sy die kar by die lughawe geparkeer het.",
      en: "e.g. Voicemail — a girl leaving a message for her mum about where she parked the car at the airport.",
    },
    exerciseHint: {
      af: "8 onafhanklike kort opnames (~30–45 sek). Een prent-MK-vraag per item. Vul slotte in vir spesifieke scenarios of laat leeg vir AI-keuse.",
      en: "8 independent short recordings (~30–45s). One picture-MCQ per item. Fill slots for specific scenarios or leave blank for the AI to invent.",
    },
  },
  2: {
    slots: 5,
    slotLabel: { af: "Opname", en: "Recording" },
    perSlotPlaceholder: {
      af: "Bv. 'n Onderwyser praat met 'n leerder oor haar vordering — 2 vrae oor haar hoofprobleem en haar plan.",
      en: "e.g. A teacher talking to a student about her progress — 2 questions on her main difficulty and her plan.",
    },
    exerciseHint: {
      af: "5 kort opnames (~45–60 sek) met 'n kort vertelraamwerk en 2 MK-vrae elk. 10 vrae in totaal.",
      en: "5 short recordings (~45–60s) with brief narrator framing and 2 MCQs each. 10 questions total.",
    },
  },
  3: {
    slots: 1,
    slotLabel: { af: "Praatjie", en: "Talk" },
    perSlotPlaceholder: {
      af: "Bv. 'n Mariene bioloog gee 'n skoolpraatjie oor koraalrifherstel — sy bespreek haar loopbaan, huidige projek en raad vir jong wetenskaplikes.",
      en: "e.g. A marine biologist giving a school talk about coral reef restoration — her career, current project, and advice for young scientists.",
    },
    exerciseHint: {
      af: "Een langer monoloog (~3–4 min, een genoemde spreker) met 8 MK-vrae in volgorde.",
      en: "One longer monologue (~3–4 min, single named speaker) with 8 MCQs in order.",
    },
  },
  4: {
    slots: 6,
    slotLabel: { af: "Spreker", en: "Speaker" },
    perSlotPlaceholder: {
      af: "Bv. Spreker sê vrywilligerswerk het haar gehelp om skaamheid te oorkom.",
      en: "e.g. Speaker says volunteering helped them overcome shyness.",
    },
    exerciseHint: {
      af: "Kies 'n gedeelde tema. 6 eerstepersoonsmonoloë (~30 sek) wat elk een van 8 stellings (A–H) uitdruk. Twee stellings is afleiers.",
      en: "Pick a shared theme. 6 first-person monologues (~30s each), each expressing one of 8 statements (A–H). Two are distractors.",
    },
  },
  5: {
    slots: 1,
    slotLabel: { af: "Onderhoud", en: "Interview" },
    perSlotPlaceholder: {
      af: "Bv. 'n Radio-aanbieder onderhou 'n jong Olimpiese swemmer oor oefening, skoolbalans en raad aan ander tienerathlete.",
      en: "e.g. A radio host interviewing a young Olympic swimmer about training, school balance, and advice for other teen athletes.",
    },
    exerciseHint: {
      af: "Een langer onderhoud (~4 min, onderhoudvoerder + genoemde gas) met 8 MK-vrae in volgorde.",
      en: "One longer interview (~4 min, interviewer + named guest) with 8 MCQs in order.",
    },
  },
};

// -------------------- PaperScript shape (generator output) --------------------

export type ExerciseType =
  | "mcq_picture"
  | "mcq_text_pair"
  | "mcq_long"
  | "matching";

export type PaperOption = {
  letter: string;
  label: string;
  image_prompt?: string;
};

export type PaperTurn = { speaker: string; text: string };

export type PaperItem = {
  number: number;
  prompt: string;
  context?: string;
  speakers_meta: string[];
  turns: PaperTurn[];
  options?: PaperOption[];
  answer?: string;
};

export type PaperPairItem = {
  context: string;
  speakers_meta: string[];
  turns: PaperTurn[];
  questions: {
    number: number;
    prompt: string;
    options: PaperOption[];
    answer: string;
  }[];
};

export type PaperExercise = {
  number: ExerciseNum;
  type: ExerciseType;
  title: string;
  instructions: string;
  reading_pause_s: number;
  items?: PaperItem[];
  pair_items?: PaperPairItem[];
  shared_options?: { letter: string; text: string }[];
  speaker_items?: PaperItem[];
};

export type PaperScript = {
  schema_version: 2;
  meta: {
    title: string;
    topic: string;
    level: ExamLevel;
    paper_code: string;
    session_label: string;
  };
  exercises: PaperExercise[];
};

export function isPaperScript(v: unknown): v is PaperScript {
  return !!v && typeof v === "object" && (v as { schema_version?: number }).schema_version === 2;
}
