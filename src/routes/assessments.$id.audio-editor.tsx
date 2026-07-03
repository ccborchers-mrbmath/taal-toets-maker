import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, RotateCcw, Sparkles, Undo2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import {
  generateStaleSegments,
  listExerciseSegments,
  regenerateSegment,
  restitchExercise,
  revertSegment,
  updateScriptRowText,
} from "@/lib/audio-segments.functions";

export const Route = createFileRoute("/assessments/$id/audio-editor")({
  head: () => ({ meta: [{ title: "Klank-redakteur — Luister Lab" }] }),
  component: AudioEditorPage,
});

function AudioEditorPage() {
  return (
    <AppShell>
      <EditorContent />
    </AppShell>
  );
}

type Exercise = {
  id: string;
  number: number;
  rubric: string;
  audio_url: string | null;
};

function EditorContent() {
  const { id } = Route.useParams();
  const { t } = useT();

  const assessmentQ = useQuery({
    queryKey: ["audio-editor-assessment", id],
    queryFn: async () => {
      const { data: a, error } = await supabase
        .from("assessments")
        .select("id,title")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const { data: exs, error: eErr } = await supabase
        .from("exercises")
        .select("id,number,rubric,audio_url")
        .eq("assessment_id", id)
        .order("number");
      if (eErr) throw eErr;
      return { assessment: a, exercises: (exs ?? []) as Exercise[] };
    },
  });

  if (assessmentQ.isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">{t("Laai …", "Loading …")}</div>;
  }
  if (!assessmentQ.data?.assessment) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">{t("Vraestel nie gevind nie.", "Paper not found.")}</div>;
  }

  const { assessment, exercises } = assessmentQ.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/assessments/$id" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> {t("Terug na vraestel", "Back to paper")}
          </Link>
        </Button>
      </div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold">{t("Klank-redakteur", "Audio editor")}</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{assessment.title}</span>
          {" · "}
          {t(
            "Redigeer enkele reëls, herstel klank per snit en vergelyk vorige weergawes.",
            "Edit single lines, regenerate audio per segment and compare previous takes.",
          )}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Wenk: verander die woorde na 'n duideliker Afrikaanse frase (bv. \"Lekker verjaarsdag\" i.p.v. \"Gelukkige verjaarsdag\"), regenereer daardie een snit, en stik dan die oefening weer aan mekaar.",
            "Tip: rephrase to a clearer Afrikaans expression (e.g. \"Lekker verjaarsdag\" instead of \"Gelukkige verjaarsdag\"), regenerate that single segment, then re-stitch the exercise.",
          )}
        </p>
      </div>

      <div className="space-y-8">
        {exercises.map((ex) => (
          <ExerciseEditor key={ex.id} exercise={ex} />
        ))}
      </div>
    </div>
  );
}

function ExerciseEditor({ exercise }: { exercise: Exercise }) {
  const qc = useQueryClient();
  const { t } = useT();
  const [busyRestitch, setBusyRestitch] = useState(false);
  const [busyStale, setBusyStale] = useState(false);

  const segsQ = useQuery({
    queryKey: ["audio-editor-segments", exercise.id],
    queryFn: () => listExerciseSegments({ data: { exercise_id: exercise.id } }),
  });

  const rows = segsQ.data?.rows ?? [];
  const staleCount = rows.filter((r) => r.audio_stale || !r.audio_url).length;

  const onGenStale = async () => {
    setBusyStale(true);
    try {
      const res = await generateStaleSegments({ data: { exercise_id: exercise.id } });
      toast.success(
        t(
          `${res.synthesized} snit${res.synthesized === 1 ? "" : "te"} gesintetiseer`,
          `${res.synthesized} segment${res.synthesized === 1 ? "" : "s"} synthesised`,
        ),
      );
      await qc.invalidateQueries({ queryKey: ["audio-editor-segments", exercise.id] });
    } catch (err) {
      toast.error(t("Sintese misluk", "Synthesis failed"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyStale(false);
    }
  };

  const onRestitch = async () => {
    setBusyRestitch(true);
    try {
      await restitchExercise({ data: { exercise_id: exercise.id, allow_synthesis: true } });
      toast.success(t("Oefening opnuut aanmekaar gestik", "Exercise re-stitched"));
      await qc.invalidateQueries({ queryKey: ["assessment-full"] });
    } catch (err) {
      toast.error(t("Aanmekaarstik misluk", "Re-stitch failed"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyRestitch(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">
            {t("Oefening", "Exercise")} {exercise.number}
          </h2>
          <p className="line-clamp-1 max-w-xl text-xs text-muted-foreground">{exercise.rubric}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t(
              `${rows.length} reëls · ${staleCount} nog nodig`,
              `${rows.length} lines · ${staleCount} still needed`,
            )}
          </span>
          <Button size="sm" variant="outline" onClick={onGenStale} disabled={busyStale || staleCount === 0}>
            {busyStale ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            {t("Genereer verouderde", "Generate stale")}
          </Button>
          <Button size="sm" onClick={onRestitch} disabled={busyRestitch}>
            {busyRestitch ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
            {t("Stik oefening", "Stitch exercise")}
          </Button>
        </div>
      </header>

      {segsQ.isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">{t("Laai reëls …", "Loading lines …")}</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">{t("Geen transkripsie-reëls nog nie.", "No transcript lines yet.")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-2 text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1 w-12">#</th>
                <th className="px-2 py-1 w-32">{t("Spreker", "Speaker")}</th>
                <th className="px-2 py-1">{t("Teks (huidig)", "Text (current)")}</th>
                <th className="px-2 py-1 w-56">{t("Klank (huidig)", "Audio (current)")}</th>
                <th className="px-2 py-1 w-56">{t("Vorige weergawe", "Previous take")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SegmentRow key={row.id} exerciseId={exercise.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type SegRow = NonNullable<Awaited<ReturnType<typeof listExerciseSegments>>>["rows"][number];

function SegmentRow({ exerciseId, row }: { exerciseId: string; row: SegRow }) {
  const qc = useQueryClient();
  const { t } = useT();
  const [text, setText] = useState(row.transcript);
  const [savingText, setSavingText] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [reverting, setReverting] = useState(false);
  const dirty = text.trim() !== row.transcript.trim();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["audio-editor-segments", exerciseId] });

  const onSaveText = async () => {
    setSavingText(true);
    try {
      await updateScriptRowText({ data: { script_row_id: row.id, transcript: text.trim() } });
      toast.success(t("Teks gestoor — klank as verouderd gemerk", "Text saved — audio marked stale"));
      await invalidate();
    } catch (err) {
      toast.error(t("Kon nie stoor nie", "Could not save"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingText(false);
    }
  };

  const onRegenerate = async () => {
    if (dirty) {
      try {
        await updateScriptRowText({ data: { script_row_id: row.id, transcript: text.trim() } });
      } catch (err) {
        toast.error(t("Kon nie teks stoor nie", "Could not save text"), { description: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
    setRegenerating(true);
    try {
      await regenerateSegment({ data: { script_row_id: row.id } });
      toast.success(t("Snit hergegenereer", "Segment regenerated"));
      await invalidate();
    } catch (err) {
      toast.error(t("Regenerering misluk", "Regeneration failed"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRegenerating(false);
    }
  };

  const onRevert = async () => {
    setReverting(true);
    try {
      await revertSegment({ data: { script_row_id: row.id } });
      toast.success(t("Teruggeruil na vorige weergawe", "Swapped back to previous take"));
      await invalidate();
    } catch (err) {
      toast.error(t("Terugruil misluk", "Swap-back failed"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setReverting(false);
    }
  };

  const status = !row.audio_url
    ? { label: t("Nog geen", "None yet"), className: "bg-muted text-muted-foreground" }
    : row.audio_stale
      ? { label: t("Verouderd", "Stale"), className: "bg-amber-100 text-amber-900" }
      : { label: t("Vars", "Fresh"), className: "bg-emerald-100 text-emerald-900" };

  return (
    <tr className="align-top">
      <td className="px-2 py-2 text-xs text-muted-foreground">{row.sequence}</td>
      <td className="px-2 py-2">
        <div className="text-xs font-medium">{row.speaker_label ?? t("Verteller", "Narrator")}</div>
        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${status.className}`}>
          {status.label}
        </span>
      </td>
      <td className="px-2 py-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.max(2, Math.min(6, Math.ceil(text.length / 80)))}
          className="text-sm"
        />
        {dirty ? (
          <div className="mt-1 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onSaveText} disabled={savingText}>
              {savingText ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {t("Stoor teks", "Save text")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setText(row.transcript)}>{t("Kanselleer", "Cancel")}</Button>
          </div>
        ) : null}
      </td>
      <td className="px-2 py-2">
        {row.audio_url ? (
          <audio controls src={row.audio_url} className="mb-1 h-8 w-full" preload="none" />
        ) : (
          <div className="mb-1 text-xs italic text-muted-foreground">{t("Nog geen klank nie", "No audio yet")}</div>
        )}
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
          )}
          {t("Regenereer", "Regenerate")}
        </Button>
      </td>
      <td className="px-2 py-2">
        {row.previous_audio_url ? (
          <>
            <audio controls src={row.previous_audio_url} className="mb-1 h-8 w-full" preload="none" />
            <div className="mb-1 line-clamp-2 text-[11px] text-muted-foreground">"{row.previous_transcript}"</div>
            <Button size="sm" variant="ghost" onClick={onRevert} disabled={reverting}>
              {reverting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="mr-1 h-3.5 w-3.5" />
              )}
              {t("Ruil terug", "Swap back")}
            </Button>
          </>
        ) : (
          <div className="text-xs italic text-muted-foreground">—</div>
        )}
      </td>
    </tr>
  );
}
