// Voice roster for ElevenLabs v3 TTS. UK English voices chosen because they
// reproduce South African Afrikaans pronunciation and cadence well on v3.
//
// Buckets cover the speaker variety a Cambridge IGCSE Afrikaans listening
// paper needs: narrator, adult male/female, young (teen/child) male/female,
// elderly male/female. The picker reads each speaker_label coming out of
// generate.functions.ts and slots it into a bucket, then rotates within the
// bucket so two different "M" speakers in the same exercise get different
// voices.

export type VoiceBucket =
  | "narrator"
  | "adult_male"
  | "adult_female"
  | "young_male"
  | "young_female"
  | "elderly_male"
  | "elderly_female";

export type Voice = {
  id: string;
  name: string;
  bucket: VoiceBucket;
};

export const VOICES: Voice[] = [
  // Narrator (used for rubrics + "Jy sal nou die opname weer hoor.")
  { id: "cCYjmrGZaI86GUJ7F2Nn", name: "Verteller",  bucket: "narrator" },

  // Adult males
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian",   bucket: "adult_male" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam",    bucket: "adult_male" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric",    bucket: "adult_male" },

  // Adult females
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah",   bucket: "adult_female" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice",   bucket: "adult_female" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", bucket: "adult_female" },

  // Younger voices (teen / late-teen timbre)
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", bucket: "young_male" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",    bucket: "young_female" },

  // Elderly voices
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",  bucket: "elderly_male" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill",    bucket: "elderly_male" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", bucket: "elderly_female" },
];

const BY_BUCKET: Record<VoiceBucket, Voice[]> = VOICES.reduce((acc, v) => {
  (acc[v.bucket] ||= []).push(v);
  return acc;
}, {} as Record<VoiceBucket, Voice[]>);

// Heuristic: infer a bucket from a speaker label (Afrikaans-aware).
export function bucketForLabel(label: string | null | undefined): VoiceBucket {
  const s = (label ?? "").toLowerCase().trim();
  if (!s) return "narrator";

  const elderly = /(ouma|oupa|bejaar|oud(e)? (man|vrou|dame)|tannie|oom)/.test(s);
  const youth = /(seun|meisie|kind|tiener|leerder|skolier|student|jong)/.test(s);
  const female =
    /(^v$|^v\d|vrou|mevrou|tannie|ouma|meisie|dame|juffrou|gasvrou|aanbiedster|onderwyseres)/.test(s);
  const male =
    /(^m$|^m\d|man|meneer|mnr|oupa|seun|oom|gasheer|aanbieder|onderwyser)/.test(s);

  if (elderly && female) return "elderly_female";
  if (elderly && male) return "elderly_male";
  if (elderly) return "elderly_male";
  if (youth && female) return "young_female";
  if (youth && male) return "young_male";
  if (youth) return "young_female";
  if (female) return "adult_female";
  if (male) return "adult_male";

  // Onderhoudvoerder / interviewer → adult, alternate by hash
  if (/onderhoud|verteller|aanbied/.test(s)) return "narrator";

  // Fallback: hash to adult male/female so unknown names stay stable.
  const h = [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
  return h % 2 === 0 ? "adult_male" : "adult_female";
}

// Build a stable label → voiceId map for one exercise.
// Rotates within a bucket so two distinct "M" / "V" / first-name speakers
// don't share a voice. Falls back to the next bucket if the chosen one is
// exhausted.
export function assignVoices(labels: string[]): Record<string, string> {
  const used: Record<VoiceBucket, number> = {
    narrator: 0,
    adult_male: 0,
    adult_female: 0,
    young_male: 0,
    young_female: 0,
    elderly_male: 0,
    elderly_female: 0,
  };
  const map: Record<string, string> = {};
  const unique = Array.from(new Set(labels.map((l) => l.trim()).filter(Boolean)));
  for (const label of unique) {
    const bucket = bucketForLabel(label);
    const pool = BY_BUCKET[bucket] ?? [];
    const fallback = BY_BUCKET.adult_male.concat(BY_BUCKET.adult_female);
    const chosen = pool[used[bucket] % pool.length] ?? fallback[used.adult_male % fallback.length];
    map[label] = chosen.id;
    used[bucket] = (used[bucket] ?? 0) + 1;
  }
  return map;
}

export function narratorVoiceId(): string {
  return BY_BUCKET.narrator[0].id;
}

export function voiceName(id: string): string {
  return VOICES.find((v) => v.id === id)?.name ?? id;
}
