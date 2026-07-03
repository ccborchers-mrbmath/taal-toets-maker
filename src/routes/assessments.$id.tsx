import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Download, FileText, Headphones, ImageIcon, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { generatePaper } from "@/lib/generate.functions";
import { generateOptionImage } from "@/lib/images.functions";
import { generatePaperPdf } from "@/lib/pdf.functions";
import { generateExerciseAudio, refreshExerciseAudioUrl } from "@/lib/audio.functions";
import { generateFullPaperAudio } from "@/lib/full-audio.functions";


type PdfKind = "paper" | "mark_scheme" | "transcript";

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const Route = createFileRoute("/assessments/$id")({
  head: () => ({ meta: [{ title: "Vraestel — Luister Lab" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    kicked: search.kicked === "1" || search.kicked === 1 ? 1 : undefined,
  }),
  component: AssessmentEditorPage,
});


function AssessmentEditorPage() {
  return (
    <AppShell>
      <EditorContent />
    </AppShell>
  );
}

type FullPaper = {
  assessment: {
    id: string; title: string; paper_code: string; status: string;
    level: string; part_type: string; generation_error: string | null;
    paper_pdf_path: string | null;
    mark_scheme_pdf_path: string | null;
    transcript_pdf_path: string | null;
    full_audio_path: string | null;
    school_logo_path: string | null;
    date_of_assessment: string | null;
  };


  exercises: {
    id: string; number: number; kind: string; rubric: string;
    intro: string | null; statements: unknown;
    audio_url: string | null;
    voice_map: Record<string, unknown> | null;
    questions: {
      id: string; number: number; stem: string; correct_letter: string;
      speaker_index: number | null;
      question_options: { id: string; letter: string; text: string | null; image_prompt: string | null; image_url: string | null }[];
    }[];
    listening_scripts: { sequence: number; speaker_label: string | null; transcript: string }[];
  }[];
};

function EditorContent() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const kicked = search.kicked === 1;

  const { t, locale } = useT();
  const [generating, setGenerating] = useState(false);
  const [showMarks, setShowMarks] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioBusyIds, setAudioBusyIds] = useState<Set<string>>(() => new Set());
  const setAudioBusy = (exId: string, busy: boolean) => {
    setAudioBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(exId);
      else next.delete(exId);
      return next;
    });
  };

  const query = useQuery<FullPaper | null>({
    queryKey: ["assessment-full", id],
    queryFn: async () => {
      const { data: a, error } = await supabase
        .from("assessments")
        .select("id,title,paper_code,status,level,part_type,generation_error,paper_pdf_path,mark_scheme_pdf_path,transcript_pdf_path,full_audio_path,school_logo_path,date_of_assessment")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!a) return null;
      const { data: exs, error: exErr } = await supabase
        .from("exercises")
        .select("id,number,kind,rubric,intro,statements,audio_url,voice_map,questions(id,number,stem,correct_letter,speaker_index,question_options(id,letter,text,image_prompt,image_url)),listening_scripts(sequence,speaker_label,transcript)")
        .eq("assessment_id", id)
        .order("number");
      if (exErr) throw exErr;
      return { assessment: a, exercises: (exs ?? []) as FullPaper["exercises"] };
    },
    refetchInterval: (q) => {
      const s = q.state.data?.assessment?.status;
      // Poll while generation is in flight. `kicked=1` (set by the "new
      // paper" flow) covers the race where the server hasn't flipped
      // status to "generating" yet — otherwise the initial fetch sees
      // "draft" and polling would never start.
      if (s === "generating") return 2500;
      if (kicked && s === "draft") return 2000;
      return false;
    },
  });


  const run = async () => {
    setGenerating(true);
    try {
      await generatePaper({ data: { assessment_id: id } });
      await query.refetch();
      toast.success(locale === "af" ? "Vraestel gereed" : "Paper ready");
    } catch (err) {
      toast.error(t("common.error"), { description: err instanceof Error ? err.message : String(err) });
      await query.refetch();
    } finally {
      setGenerating(false);
    }
  };

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="py-12 text-center text-sm text-muted-foreground">{t("common.error")}</div>
      </div>
    );
  }

  const { assessment, exercises } = query.data;
  // While `kicked=1`, treat "draft" as "generation kick-off in flight" so
  // the Generate CTA is suppressed (prevents the user from double-clicking
  // and being charged a second credit before the server flips status).
  const isGenerating = assessment.status === "generating" || generating || (kicked && assessment.status === "draft");
  const isFailed = assessment.status === "failed";
  const isReady = assessment.status === "ready" && exercises.length > 0;
  const audioInFlight = audioBusyIds.size > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("editor.backLibrary")}
      </Link>

      <div className="paper rounded-lg p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{assessment.paper_code}</div>
            <h1 className="mt-1 font-display text-2xl font-semibold">{assessment.title}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              {locale === "af" ? "Vlak" : "Tier"}: {assessment.level === "extended" ? (locale === "af" ? "Uitgebreid" : "Extended") : (locale === "af" ? "Kern" : "Core")}
            </div>
          </div>
          <span className="exam-stamp">{t(`dashboard.status.${assessment.status as "draft" | "generating" | "ready" | "failed"}`)}</span>
        </div>

        {/* Workflow stepper */}
        <WorkflowStepper
          locale={locale}
          status={assessment.status}
          exercises={exercises}
          onGenerate={run}
          generating={isGenerating}
          audioInFlight={audioInFlight}
          paperPdfDone={!!assessment.paper_pdf_path}
          markSchemePdfDone={!!assessment.mark_scheme_pdf_path}
          transcriptPdfDone={!!assessment.transcript_pdf_path}
        />


        {/* Action bar */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {(assessment.status === "draft" || isFailed) && (
            <Button onClick={run} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              {isFailed ? (locale === "af" ? "Probeer weer" : "Try again") : t("new.generate")}
            </Button>
          )}
          {isReady && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowMarks((s) => !s)}>
                {showMarks ? (locale === "af" ? "Versteek memorandum" : "Hide mark scheme") : t("editor.markScheme")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTranscript((s) => !s)}>
                {showTranscript ? (locale === "af" ? "Versteek transkripsie" : "Hide transcript") : t("editor.transcript")}
              </Button>
            </>
          )}

        </div>

        {isFailed && assessment.generation_error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {assessment.generation_error}
          </div>
        )}

        {isGenerating && (
          <div className="mt-6 flex items-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("new.generating")}
          </div>
        )}

        {assessment.status === "draft" && !isGenerating && (
          <div className="mt-6 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {locale === "af" ? "Klik op 'Genereer vraestel' om die oefeninge te skep." : "Click 'Generate paper' to create the exercises."}
          </div>
        )}

        {isReady && (
          <div className="mt-8 space-y-10">
            {exercises.map((ex) => (
              <ExerciseBlock
                key={ex.id}
                ex={ex}
                showMarks={showMarks}
                showTranscript={showTranscript}
                onAudioGenerated={() => query.refetch()}
                onAudioBusyChange={(b) => setAudioBusy(ex.id, b)}
              />
            ))}

            <section id="exports" className="border-t border-border pt-6 scroll-mt-20">
              <h2 className="font-display text-lg font-semibold">
                {locale === "af" ? "Uitvoere" : "Exports"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {locale === "af"
                  ? "Laai die vraestel, memorandum, transkripsie en volledige luister-MP3 af."
                  : "Download the question paper, mark scheme, transcript and full listening MP3."}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <PdfButton id={id} kind="paper" label={locale === "af" ? "Vraestel PDF" : "Question paper PDF"} cached={!!assessment.paper_pdf_path} onChange={() => query.refetch()} />
                <PdfButton id={id} kind="mark_scheme" label={locale === "af" ? "Memorandum PDF" : "Mark scheme PDF"} cached={!!assessment.mark_scheme_pdf_path} onChange={() => query.refetch()} />
                <PdfButton id={id} kind="transcript" label={locale === "af" ? "Transkripsie PDF" : "Transcript PDF"} cached={!!assessment.transcript_pdf_path} onChange={() => query.refetch()} />
                <FullAudioButton
                  id={id}
                  cached={!!assessment.full_audio_path}
                  ready={exercises.some((e) => !!e.audio_url) && !audioInFlight}
                  onChange={() => query.refetch()}
                />
              </div>

              <CoverSettings
                assessmentId={id}
                logoPath={assessment.school_logo_path}
                dateOfAssessment={assessment.date_of_assessment}
                paperCached={!!assessment.paper_pdf_path}
                onChange={() => query.refetch()}
              />


            </section>
          </div>
        )}

      </div>
    </div>
  );
}

function ExerciseBlock({
  ex,
  showMarks,
  showTranscript,
  onAudioGenerated,
  onAudioBusyChange,
}: {
  ex: FullPaper["exercises"][number];
  showMarks: boolean;
  showTranscript: boolean;
  onAudioGenerated?: () => void;
  onAudioBusyChange?: (busy: boolean) => void;
}) {

  const { locale } = useT();
  const statements = Array.isArray(ex.statements) ? (ex.statements as { letter: string; text: string }[]) : null;

  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [batching, setBatching] = useState(false);

  const optionsWithPrompts = ex.questions.flatMap((q) =>
    q.question_options.filter((o) => o.image_prompt),
  );
  const totalNeedingImages = optionsWithPrompts.length;
  const missing = optionsWithPrompts.filter(
    (o) => !(urls[o.id] ?? o.image_url),
  );

  async function genOne(optionId: string) {
    setPending((p) => ({ ...p, [optionId]: true }));
    try {
      const res = await generateOptionImage({ data: { option_id: optionId } });
      setUrls((u) => ({ ...u, [optionId]: res.image_url }));
    } catch (err) {
      toast.error(locale === "af" ? "Beeld misluk" : "Image failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPending((p) => ({ ...p, [optionId]: false }));
    }
  }

  async function genAll() {
    setBatching(true);
    try {
      for (const o of missing) {
        // sequential — keeps rate limits and per-image cost predictable
        // eslint-disable-next-line no-await-in-loop
        await genOne(o.id);
      }
      toast.success(locale === "af" ? "Beelde gegenereer" : "Images generated");
    } finally {
      setBatching(false);
    }
  }

  return (
    <section id={`exercise-${ex.number}`} className="border-t border-border pt-6 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          {locale === "af" ? "Oefening" : "Exercise"} {ex.number}
        </h2>
        {totalNeedingImages > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={genAll}
            disabled={batching || missing.length === 0}
          >
            {batching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
            )}
            {missing.length === 0
              ? locale === "af"
                ? "Alle beelde gereed"
                : "All images ready"
              : locale === "af"
              ? `Genereer beelde (${missing.length}/${totalNeedingImages})`
              : `Generate images (${missing.length}/${totalNeedingImages})`}
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ex.rubric}</p>

      <AudioBlock ex={ex} onGenerated={onAudioGenerated} onBusyChange={onAudioBusyChange} />


      {statements && (
        <ol className="mt-4 grid gap-1 rounded-md border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          {statements.map((s) => (
            <li key={s.letter}><span className="font-semibold">{s.letter}</span> · {s.text}</li>
          ))}
        </ol>
      )}

      <ol className="mt-4 space-y-4">
        {ex.questions.map((q) => (
          <li key={q.id} className="rounded-md border border-border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm">
                <span className="mr-2 font-semibold tabular-nums">{q.number}.</span>
                {q.stem}
              </div>
              {showMarks && (
                <span className="rounded bg-foreground/10 px-2 py-0.5 text-[10px] font-mono uppercase">
                  {q.correct_letter}
                </span>
              )}
            </div>
            {q.question_options.length > 0 && (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {q.question_options
                  .slice()
                  .sort((a, b) => a.letter.localeCompare(b.letter))
                  .map((o) => {
                    const url = urls[o.id] ?? o.image_url;
                    const busy = !!pending[o.id];
                    return (
                      <li key={o.letter} className="rounded-md border border-border p-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[11px] font-mono">
                            {o.letter}
                          </span>
                          <span className="truncate">{o.text ?? o.image_prompt ?? "—"}</span>
                        </div>
                        {o.image_prompt && (
                          <div className="mt-2">
                            {url ? (
                              <img
                                src={url}
                                alt={o.image_prompt}
                                className="aspect-square w-full rounded border border-border object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-border bg-muted/30 p-2 text-center text-xs text-muted-foreground">
                                <ImageIcon className="h-4 w-4" />
                                <span className="line-clamp-3">{o.image_prompt}</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-1 h-7 px-2 text-xs"
                                  onClick={() => genOne(o.id)}
                                  disabled={busy || batching}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : locale === "af" ? (
                                    "Genereer"
                                  ) : (
                                    "Generate"
                                  )}
                                </Button>
                              </div>
                            )}
                            {url && (
                              <button
                                type="button"
                                onClick={() => genOne(o.id)}
                                disabled={busy || batching}
                                className="mt-1 w-full text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                {busy
                                  ? locale === "af"
                                    ? "Genereer..."
                                    : "Generating..."
                                  : locale === "af"
                                  ? "Herskep"
                                  : "Regenerate"}
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {showTranscript && ex.listening_scripts.length > 0 && (
        <div className="mt-6 rounded-md border border-dashed border-border bg-muted/20 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {locale === "af" ? "Transkripsie" : "Transcript"}
          </div>
          <div className="space-y-1.5 text-sm leading-relaxed">
            {ex.listening_scripts
              .slice()
              .sort((a, b) => a.sequence - b.sequence)
              .map((s, i) => (
                <div key={i}>
                  {s.speaker_label && <span className="mr-2 font-semibold">{s.speaker_label}:</span>}
                  {s.transcript}
                </div>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PdfButton({
  id,
  kind,
  label,
  cached,
  onChange,
}: {
  id: string;
  kind: PdfKind;
  label: string;
  cached: boolean;
  onChange: () => void;
}) {
  const { locale } = useT();
  const [busy, setBusy] = useState<false | "download" | "regen">(false);
  async function run(force: boolean) {
    setBusy(force ? "regen" : "download");
    try {
      const res = await generatePaperPdf({ data: { assessment_id: id, kind, force } });
      triggerDownload(res.download_url, res.filename);
      if (!res.cached) onChange();
      if (force) {
        toast.success(locale === "af" ? "PDF herskep" : "PDF regenerated");
      }
    } catch (err) {
      toast.error(locale === "af" ? "PDF misluk" : "PDF failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="inline-flex items-center">
      <Button
        variant="outline"
        size="sm"
        onClick={() => run(false)}
        disabled={!!busy}
        className={cached ? "rounded-r-none border-r-0" : ""}
        title={cached ? (locale === "af" ? "Laai bestaande PDF af" : "Download existing PDF") : undefined}
      >
        {busy === "download" ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : cached ? (
          <Download className="mr-1.5 h-3.5 w-3.5" />
        ) : kind === "paper" ? (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <FileText className="mr-1.5 h-3.5 w-3.5" />
        )}
        {cached ? (locale === "af" ? `Laai ${label.replace(" PDF", "")} af` : `Download ${label.replace(" PDF", "")}`) : label}
      </Button>
      {cached && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run(true)}
          disabled={!!busy}
          className="rounded-l-none px-2"
          title={locale === "af" ? "Herskep PDF" : "Regenerate PDF"}
        >
          {busy === "regen" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}


function AudioBlock({ ex, onGenerated, onBusyChange }: { ex: FullPaper["exercises"][number]; onGenerated?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const { locale } = useT();
  const t = (af: string, en: string) => (locale === "af" ? af : en);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(ex.audio_url);
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const m = (ex.voice_map ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === "string") out[k] = v;
      else if (v && typeof v === "object" && "id" in v && typeof (v as { id: unknown }).id === "string") {
        out[k] = (v as { id: string }).id;
      }
    }
    return out;
  });

  // Unique speaker labels actually present in the script.
  const labels = Array.from(
    new Set(
      (ex.listening_scripts ?? [])
        .map((r) => r.speaker_label?.trim() ?? "")
        .filter((l) => l.length > 0),
    ),
  );

  // The user's voice library (cached across all AudioBlocks).
  const library = useQuery({
    queryKey: ["voice-library"],
    queryFn: async () => {
      const { listMyVoices } = await import("@/lib/voice-cast.functions");
      return await listMyVoices();
    },
    staleTime: 60_000,
  });

  async function generate() {
    setBusy(true);
    onBusyChange?.(true);
    try {
      const res = await generateExerciseAudio({ data: { exercise_id: ex.id } });
      setUrl(res.audio_url);
      toast.success(t("Klank gegenereer", "Audio generated"));
      onGenerated?.();

    } catch (err) {
      toast.error(t("Klank misluk", "Audio failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function refresh() {
    try {
      const res = await refreshExerciseAudioUrl({ data: { exercise_id: ex.id } });
      setUrl(res.audio_url);
    } catch (err) {
      toast.error(t("Vernuwing misluk", "Refresh failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function changeVoice(label: string, voiceCastId: string) {
    const next = { ...voiceMap, [label]: voiceCastId };
    setVoiceMap(next);
    setUrl(null); // existing audio is now stale
    try {
      const { setExerciseVoiceOverride } = await import("@/lib/voice-cast.functions");
      await setExerciseVoiceOverride({
        data: { exercise_id: ex.id, label, voice_cast_id: voiceCastId },
      });
    } catch (err) {
      toast.error(t("Toewysing misluk", "Cast change failed"), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Headphones className="h-4 w-4" />
          {t("Klankopname", "Listening audio")}
        </div>
        <div className="flex items-center gap-2">
          {url && (
            <a
              href={url}
              download={`exercise-${ex.number}.mp3`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              {t("Laai af", "Download")}
            </a>
          )}
          <Link
            to="/assessments/$id/audio-editor"
            params={{ id: ex.assessment_id ?? "" }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("Redigeer per snit", "Edit segments")}
          </Link>
          <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Headphones className="mr-1.5 h-3.5 w-3.5" />
            )}
            {busy
              ? t("Genereer…", "Generating…")
              : url
              ? t("Herskep klank", "Regenerate audio")
              : t("Genereer klank", "Generate audio")}
          </Button>
        </div>
      </div>

      {url ? (
        <audio
          key={url}
          controls
          preload="none"
          className="mt-3 w-full"
          src={url}
          onError={() => void refresh()}
        >
          <track kind="captions" />
        </audio>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Geen klank nog nie. Genereer ’n stewige MP3 met inleiding, opname en herhaling.",
            "No audio yet. Generate a full MP3 with intro, recording, and repeat.",
          )}
        </p>
      )}

      {labels.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("Rolverdeling", "Casting")}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {labels.map((label) => (
              <label key={label} className="flex items-center gap-2 text-xs">
                <span className="min-w-[80px] truncate font-mono">{label}</span>
                <select
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                  value={voiceMap[label] ?? ""}
                  onChange={(e) => changeVoice(label, e.target.value)}
                >
                  <option value="">
                    {t("— kies stem —", "— pick voice —")}
                  </option>
                  {(library.data ?? [])
                    .filter((v) => v.active)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.gender}/{v.age_band}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type StepState = "pending" | "active" | "done" | "failed" | "locked";

function WorkflowStepper({
  locale,
  status,
  exercises,
  onGenerate,
  generating,
  audioInFlight,
  paperPdfDone,
  markSchemePdfDone,
  transcriptPdfDone,
}: {
  locale: "af" | "en";
  status: string;
  exercises: FullPaper["exercises"];
  onGenerate: () => void;
  generating: boolean;
  audioInFlight: boolean;
  paperPdfDone: boolean;
  markSchemePdfDone: boolean;
  transcriptPdfDone: boolean;
}) {

  const isReady = status === "ready" && exercises.length > 0;
  const isFailed = status === "failed";

  // Image progress (Exercise 1 options that have an image_prompt)
  const allImgOpts = exercises.flatMap((e) =>
    e.questions.flatMap((q) => q.question_options.filter((o) => o.image_prompt)),
  );
  const doneImgOpts = allImgOpts.filter((o) => o.image_url).length;
  const totalImgOpts = allImgOpts.length;
  const imagesDone = isReady && totalImgOpts > 0 && doneImgOpts === totalImgOpts;
  const imagesPartial = isReady && doneImgOpts > 0 && doneImgOpts < totalImgOpts;

  const t = (af: string, en: string) => (locale === "af" ? af : en);

  const textState: StepState = isFailed
    ? "failed"
    : generating || status === "generating"
    ? "active"
    : isReady
    ? "done"
    : "active";

  const imagesState: StepState = !isReady
    ? "locked"
    : totalImgOpts === 0
    ? "done"
    : imagesDone
    ? "done"
    : imagesPartial
    ? "active"
    : "pending";

  const totalAudio = isReady ? exercises.length : 0;
  const doneAudio = isReady ? exercises.filter((e) => !!e.audio_url).length : 0;
  // "Active" only while a generation request is in flight. Once nothing is
  // generating, any exercise that has audio counts as done — so partial papers
  // (e.g. only Exercise 1) are treated as complete and exports are enabled.
  const audioState: StepState = !isReady
    ? "locked"
    : audioInFlight
    ? "active"
    : doneAudio > 0
    ? "done"
    : "pending";
  const pdfDoneCount = [paperPdfDone, markSchemePdfDone, transcriptPdfDone].filter(Boolean).length;
  const pdfState: StepState = !isReady
    ? "locked"
    : pdfDoneCount === 3
    ? "done"
    : pdfDoneCount > 0
    ? "active"
    : "pending";


  const steps: Array<{
    key: string;
    icon: typeof Sparkles;
    title: string;
    sub: string;
    state: StepState;
    action?: { label: string; onClick: () => void; disabled?: boolean };
  }> = [
    {
      key: "text",
      icon: Sparkles,
      title: t("1. Teks", "1. Text"),
      sub:
        textState === "done"
          ? t("Oefeninge gegenereer", "Exercises generated")
          : textState === "active"
          ? t("Skep oefeninge…", "Generating exercises…")
          : textState === "failed"
          ? t("Misluk — probeer weer", "Failed — retry")
          : t("Genereer die 5 oefeninge", "Generate the 5 exercises"),
      state: textState,
      action:
        textState === "failed" || (status === "draft" && !generating)
          ? { label: textState === "failed" ? t("Probeer weer", "Try again") : t("Genereer", "Generate"), onClick: onGenerate, disabled: generating }
          : undefined,
    },
    {
      key: "images",
      icon: ImageIcon,
      title: t("2. Beelde", "2. Images"),
      sub:
        imagesState === "locked"
          ? t("Wag op teks", "Waiting on text")
          : totalImgOpts === 0
          ? t("Geen beelde nodig nie", "No images needed")
          : t(
              `${doneImgOpts}/${totalImgOpts} beelde gereed`,
              `${doneImgOpts}/${totalImgOpts} images ready`,
            ),
      state: imagesState,
      action:
        imagesState === "active" || imagesState === "pending"
          ? {
              label: t("Spring na Oefening 1", "Jump to Exercise 1"),
              onClick: () => {
                const el = document.getElementById("exercise-1");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              },
            }
          : undefined,
    },
    {
      key: "audio",
      icon: Headphones,
      title: t("3. Klank", "3. Audio"),
      sub:
        audioState === "locked"
          ? t("Wag op teks", "Waiting on text")
          : t(
              `${doneAudio}/${totalAudio} oefeninge met klank`,
              `${doneAudio}/${totalAudio} exercises with audio`,
            ),
      state: audioState,
      action:
        audioState === "pending" || audioState === "active"
          ? {
              label: t("Spring na Oefening 1", "Jump to Exercise 1"),
              onClick: () => {
                const el = document.getElementById("exercise-1");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              },
            }
          : undefined,
    },
    {
      key: "pdf",
      icon: FileText,
      title: t("4. PDF's", "4. PDFs"),
      sub:
        pdfState === "locked"
          ? t("Wag op teks", "Waiting on text")
          : pdfState === "done"
          ? t("Alle 3 PDF's gereed", "All 3 PDFs ready")
          : pdfState === "active"
          ? t(`${pdfDoneCount}/3 PDF's gereed`, `${pdfDoneCount}/3 PDFs ready`)
          : t("Laai vraestel, memo & transkripsie af", "Download paper, mark scheme & transcript"),
      state: pdfState,
      action:
        pdfState === "pending" || pdfState === "active" || pdfState === "done"

          ? {
              label: t("Spring na uitvoere", "Jump to exports"),
              onClick: () => {
                const el = document.getElementById("exports");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });

              },
            }
          : undefined,
    },
  ];

  return (
    <div className="mt-6 grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s) => {
        const Icon = s.icon;
        const stateStyles: Record<StepState, string> = {
          done: "border-foreground/30 bg-card",
          active: "border-accent/60 bg-card ring-1 ring-accent/40",
          failed: "border-destructive/60 bg-destructive/5",
          pending: "border-dashed border-border bg-card",
          locked: "border-dashed border-border bg-muted/30 opacity-60",
        };
        const badge: Record<StepState, ReactNodeBadge> = {
          done: { icon: <Check className="h-3.5 w-3.5" />, label: t("Gereed", "Done") },
          active: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: t("Aktief", "Active") },
          failed: { icon: null, label: t("Misluk", "Failed") },
          pending: { icon: null, label: t("Wag", "Pending") },
          locked: { icon: null, label: t("Gesluit", "Locked") },
        };
        return (
          <div key={s.key} className={`flex flex-col rounded-md border p-3 text-sm ${stateStyles[s.state]}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <Icon className="h-4 w-4" />
                {s.title}
              </div>
              <span className="inline-flex items-center gap-1 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                {badge[s.state].icon}
                {badge[s.state].label}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
            {s.action && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 self-start"
                onClick={s.action.onClick}
                disabled={s.action.disabled}
              >
                {s.action.label}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ReactNodeBadge = { icon: ReactNode; label: string };

function FullAudioButton({
  id,
  cached,
  ready,
  onChange,
}: {
  id: string;
  cached: boolean;
  ready: boolean;
  onChange: () => void;
}) {
  const { locale } = useT();
  const [busy, setBusy] = useState<false | "download" | "regen">(false);
  async function run(force: boolean) {
    setBusy(force ? "regen" : "download");
    try {
      const res = await generateFullPaperAudio({ data: { assessment_id: id, force } });
      triggerDownload(res.download_url, res.filename);
      if (!res.cached) onChange();
      if (force) toast.success(locale === "af" ? "Klank herskep" : "Audio regenerated");
    } catch (err) {
      toast.error(locale === "af" ? "Klank misluk" : "Audio failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }
  const label = locale === "af" ? "Volledige klank" : "Full audio";
  const disabled = !!busy || (!cached && !ready);
  const title = !ready && !cached
    ? locale === "af"
      ? "Genereer eers klank vir alle oefeninge"
      : "Generate audio for all exercises first"
    : cached
    ? locale === "af" ? "Laai bestaande MP3 af" : "Download existing MP3"
    : undefined;
  return (
    <div className="inline-flex items-center">
      <Button
        variant="outline"
        size="sm"
        onClick={() => run(false)}
        disabled={disabled}
        className={cached ? "rounded-r-none border-r-0" : ""}
        title={title}
      >
        {busy === "download" ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : cached ? (
          <Download className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Headphones className="mr-1.5 h-3.5 w-3.5" />
        )}
        {cached ? (locale === "af" ? `Laai ${label} af` : `Download ${label}`) : label}
      </Button>
      {cached && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run(true)}
          disabled={!!busy}
          className="rounded-l-none px-2"
          title={locale === "af" ? "Herskep klank" : "Regenerate audio"}
        >
          {busy === "regen" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}

function CoverSettings({
  assessmentId,
  logoPath,
  dateOfAssessment,
  paperCached,
  onChange,
}: {
  assessmentId: string;
  logoPath: string | null;
  dateOfAssessment: string | null;
  paperCached: boolean;
  onChange: () => void;
}) {
  const { locale } = useT();
  const [uploading, setUploading] = useState(false);
  const [date, setDate] = useState(dateOfAssessment ?? "");
  const [savedDate, setSavedDate] = useState(dateOfAssessment ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Build a signed URL for the existing logo so the user can see it.
  useEffect(() => {
    if (!logoPath) { setPreviewUrl(null); return; }
    let alive = true;
    supabase.storage.from("paper-logos").createSignedUrl(logoPath, 3600).then(({ data }) => {
      if (alive && data?.signedUrl) setPreviewUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [logoPath]);


  const onPick = async (file: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      toast.error(locale === "af" ? "Slegs PNG of JPG" : "PNG or JPG only");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error(locale === "af" ? "Maks 4 MB" : "Max 4 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${assessmentId}/logo.${ext}`;
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from("paper-logos")
        .upload(path, buf, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase
        .from("assessments")
        .update({ school_logo_path: path })
        .eq("id", assessmentId);
      if (dbErr) throw dbErr;
      const { data: signed } = await supabase.storage.from("paper-logos").createSignedUrl(path, 3600);
      setPreviewUrl(signed?.signedUrl ?? null);
      toast.success(locale === "af" ? "Skoollogo opgelaai" : "School logo uploaded");
      if (paperCached) {
        toast.message(locale === "af" ? "Druk ↻ langs Vraestel PDF om die voorblad te verfris." : "Press ↻ next to Question paper PDF to refresh the cover.");
      }
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const saveDate = async () => {
    try {
      const { error } = await supabase
        .from("assessments")
        .update({ date_of_assessment: date.trim() || null })
        .eq("id", assessmentId);
      if (error) throw error;
      setSavedDate(date);
      toast.success(locale === "af" ? "Datum gestoor" : "Date saved");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mt-6 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold">
        {locale === "af" ? "Voorblad-instellings (vraestel)" : "Cover page settings (question paper)"}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {locale === "af"
          ? "Laai jou skoollogo op en stel die datum van assessering. Hierdie verskyn op die vraestel se voorblad."
          : "Upload your school logo and set the date of assessment. These appear on the question paper cover."}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium">
            {locale === "af" ? "Skoollogo (PNG of JPG)" : "School logo (PNG or JPG)"}
          </label>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
              {previewUrl ? (
                <img src={previewUrl} alt="School logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {locale === "af" ? "Geen logo" : "No logo"}
                </span>
              )}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/40">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              <span>{uploading ? (locale === "af" ? "Laai op…" : "Uploading…") : (locale === "af" ? "Kies lêer" : "Choose file")}</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                disabled={uploading}
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="cov-date" className="text-xs font-medium">
            {locale === "af" ? "Datum van assessering" : "Date of assessment"}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="cov-date"
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder={locale === "af" ? "Bv. 15 Oktober 2026" : "e.g. 15 October 2026"}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <Button size="sm" variant="outline" onClick={saveDate} disabled={date === savedDate}>
              {locale === "af" ? "Stoor" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}



