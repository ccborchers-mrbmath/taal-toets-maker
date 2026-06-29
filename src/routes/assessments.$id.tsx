import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Download, FileText, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { generatePaper } from "@/lib/generate.functions";
import { generateOptionImage } from "@/lib/images.functions";
import { generatePaperPdf } from "@/lib/pdf.functions";

type PdfKind = "paper" | "mark_scheme" | "transcript";

function downloadBase64Pdf(filename: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const Route = createFileRoute("/assessments/$id")({
  head: () => ({ meta: [{ title: "Vraestel — Luister Lab" }] }),
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
  };
  exercises: {
    id: string; number: number; kind: string; rubric: string;
    intro: string | null; statements: unknown;
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
  const { t, locale } = useT();
  const [generating, setGenerating] = useState(false);
  const [showMarks, setShowMarks] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const query = useQuery<FullPaper | null>({
    queryKey: ["assessment-full", id],
    queryFn: async () => {
      const { data: a, error } = await supabase
        .from("assessments")
        .select("id,title,paper_code,status,level,part_type,generation_error")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!a) return null;
      const { data: exs, error: exErr } = await supabase
        .from("exercises")
        .select("id,number,kind,rubric,intro,statements,questions(id,number,stem,correct_letter,speaker_index,question_options(id,letter,text,image_prompt,image_url)),listening_scripts(sequence,speaker_label,transcript)")
        .eq("assessment_id", id)
        .order("number");
      if (exErr) throw exErr;
      return { assessment: a, exercises: (exs ?? []) as FullPaper["exercises"] };
    },
    refetchInterval: (q) => {
      const s = q.state.data?.assessment?.status;
      return s === "generating" ? 2500 : false;
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
  const isGenerating = assessment.status === "generating" || generating;
  const isFailed = assessment.status === "failed";
  const isReady = assessment.status === "ready" && exercises.length > 0;

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
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <PdfButton id={id} kind="paper" label={locale === "af" ? "Vraestel PDF" : "Question paper PDF"} />
                <PdfButton id={id} kind="mark_scheme" label={locale === "af" ? "Memorandum PDF" : "Mark scheme PDF"} />
                <PdfButton id={id} kind="transcript" label={locale === "af" ? "Transkripsie PDF" : "Transcript PDF"} />
              </div>
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
              />
            ))}
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
}: {
  ex: FullPaper["exercises"][number];
  showMarks: boolean;
  showTranscript: boolean;
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
    <section className="border-t border-border pt-6">
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
