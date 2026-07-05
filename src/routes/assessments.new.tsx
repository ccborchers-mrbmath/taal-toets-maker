import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Mic2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { useT, type Locale } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useNoCreditsDialog } from "@/hooks/useNoCreditsDialog";
import { isInsufficientCreditsError } from "@/lib/credits";
import { supabase } from "@/integrations/supabase/client";
import {
  EX_GUIDE,
  SELECTABLE_PARTS,
  exercisesFor,
  type ExerciseNum,
  type PartType,
} from "@/lib/parts";
import { generatePaper } from "@/lib/generate.functions";
import { listMyVoices, setAssessmentCast, type CastVoice } from "@/lib/voice-cast.functions";

export const Route = createFileRoute("/assessments/new")({
  head: () => ({ meta: [{ title: "Nuwe vraestel — Luister Lab" }] }),
  component: NewAssessmentPage,
});

function NewAssessmentPage() {
  return (
    <AppShell>
      <NewAssessmentForm />
    </AppShell>
  );
}

type PerExState = {
  notes: string;
  sharedTheme: string; // only used for Ex 4
  slots: string[];
};

function emptyForEx(n: ExerciseNum): PerExState {
  return { notes: "", sharedTheme: "", slots: Array.from({ length: EX_GUIDE[n].slots }, () => "") };
}

function buildBriefMarkdown(opts: {
  theme: string;
  parts: Partial<Record<ExerciseNum, PerExState>>;
  locale: Locale;
}): string {
  const out: string[] = [];
  const headings = opts.locale === "af"
    ? { theme: "Algehele tema", exercise: "Oefening", shared: "Gedeelde tema" }
    : { theme: "Overall theme", exercise: "Exercise", shared: "Shared theme" };
  if (opts.theme.trim()) {
    out.push(`# ${headings.theme}`, opts.theme.trim(), "");
  }
  for (const num of [1, 2, 3, 4, 5] as ExerciseNum[]) {
    const s = opts.parts[num];
    if (!s) continue;
    const hasSlot = s.slots.some((x) => x.trim());
    const hasNotes = !!s.notes.trim();
    const hasShared = num === 4 && !!s.sharedTheme.trim();
    if (!hasSlot && !hasNotes && !hasShared) continue;
    out.push(`## ${headings.exercise} ${num}`);
    if (hasShared) out.push(`${headings.shared}: ${s.sharedTheme.trim()}`);
    if (hasNotes) out.push(s.notes.trim());
    const slotLabelAf = EX_GUIDE[num].slotLabel.af;
    s.slots.forEach((v, i) => {
      if (v.trim()) out.push(`- ${slotLabelAf} ${i + 1}: ${v.trim()}`);
    });
    out.push("");
  }
  return out.join("\n").trim();
}

function NewAssessmentForm() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { showNoCreditsDialog } = useNoCreditsDialog();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [level, setLevel] = useState<"core" | "extended">("core");
  const [partType, setPartType] = useState<PartType>("full_paper");
  const [perEx, setPerEx] = useState<Record<ExerciseNum, PerExState>>({
    1: emptyForEx(1), 2: emptyForEx(2), 3: emptyForEx(3), 4: emptyForEx(4), 5: emptyForEx(5),
  });
  const [busy, setBusy] = useState(false);

  // Voice cast picker
  const [library, setLibrary] = useState<CastVoice[]>([]);
  const [castIds, setCastIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    listMyVoices()
      .then((rows) => {
        if (!alive) return;
        setLibrary(rows);
        // Default: everything active
        setCastIds(new Set(rows.filter((r) => r.active).map((r) => r.id)));
      })
      .catch(() => { /* ignore — page still works without cast */ });
    return () => { alive = false; };
  }, []);

  const activeExercises = useMemo(() => exercisesFor(partType), [partType]);
  const activePart = SELECTABLE_PARTS.find((p) => p.id === partType)!;

  const updateEx = (n: ExerciseNum, patch: Partial<PerExState>) =>
    setPerEx((prev) => ({ ...prev, [n]: { ...prev[n], ...patch } }));
  const updateSlot = (n: ExerciseNum, idx: number, val: string) =>
    setPerEx((prev) => {
      const slots = [...prev[n].slots];
      slots[idx] = val;
      return { ...prev, [n]: { ...prev[n], slots } };
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const briefMd = buildBriefMarkdown({
        theme,
        parts: Object.fromEntries(activeExercises.map((n) => [n, perEx[n]])) as Partial<Record<ExerciseNum, PerExState>>,
        locale,
      });

      const { data: created, error } = await supabase
        .from("assessments")
        .insert({
          created_by: user.id,
          title: title.trim() || (locale === "af" ? "Oefenvraestel" : "Practice Paper"),
          theme_hint: theme.trim() || null,
          brief: briefMd || null,
          part_type: partType,
          level,
          paper_code: partType === "full_paper" ? "Afrikaans TT · Luister" : `Afrikaans TT · Luister — ${activePart.shortLabel.af}`,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;

      // Persist the cast selection for this paper (server-validated against
      // the user's own library). Generation reads this to write only roles
      // the cast can fill.
      if (castIds.size > 0) {
        try {
          await setAssessmentCast({
            data: { assessment_id: created.id, voice_cast_ids: [...castIds] },
          });
        } catch (err) {
          console.warn("Voice cast not saved", err);
        }
      }


      toast.message(locale === "af" ? "Vraestel word geskep…" : "Generating paper…");

      // Kick off generation BEFORE navigating so the fetch is initiated from
      // the still-mounted context and isn't torn down by the route change.
      generatePaper({ data: { assessment_id: created.id } }).catch((err) => {
        console.error("Generation failed", err);
        if (isInsufficientCreditsError(err)) {
          showNoCreditsDialog();
        } else {
          toast.error(t("common.error"), { description: err instanceof Error ? err.message : String(err) });
        }
      });

      navigate({ to: "/assessments/$id", params: { id: created.id }, search: { kicked: 1 } });
    } catch (err) {
      toast.error(t("common.error"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("new.backLibrary")}
      </Link>

      <div className="paper rounded-lg p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold">{t("new.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("new.subtitle")}</p>

        <form onSubmit={submit} className="mt-6 space-y-6">
          {/* Title + Level */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">{t("new.titleLabel")}</Label>
              <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("new.titlePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="level">{locale === "af" ? "Vlak" : "Tier"}</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as "core" | "extended")}>
                <SelectTrigger id="level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">{locale === "af" ? "Kern (Core)" : "Core"}</SelectItem>
                  <SelectItem value="extended">{locale === "af" ? "Uitgebreid (Extended)" : "Extended"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-1.5">
            <Label htmlFor="theme">{t("new.themeLabel")}</Label>
            <Textarea id="theme" rows={2} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={t("new.themePlaceholder")} />
          </div>

          {/* Part picker */}
          <div className="space-y-2">
            <Label>{locale === "af" ? "Wat wil jy genereer?" : "What do you want to generate?"}</Label>
            <RadioGroup
              value={partType}
              onValueChange={(v) => setPartType(v as PartType)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {SELECTABLE_PARTS.map((p) => (
                <label
                  key={p.id}
                  htmlFor={`pt-${p.id}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                    partType === p.id ? "border-foreground/60 bg-muted/40" : "border-border hover:bg-muted/20"
                  }`}
                >
                  <RadioGroupItem id={`pt-${p.id}`} value={p.id} className="mt-0.5" />
                  <div>
                    <div className="font-medium">{p.label[locale]}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{p.summary[locale]}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Voice cast picker */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mic2 className="h-4 w-4" />
              {locale === "af" ? "Stem-rolverdeling vir hierdie vraestel" : "Voice cast for this paper"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {locale === "af"
                ? "Kies watter stemme uit jou biblioteek beskikbaar is. Die AI sal slegs sprekers skryf wat hierdie stemme kan vertolk."
                : "Pick which voices from your library are available. The AI will only write speakers these voices can play."}{" "}
              <Link to="/voices" className="underline">
                {locale === "af" ? "Bestuur biblioteek" : "Manage library"}
              </Link>
            </p>
            {library.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                {locale === "af"
                  ? "Geen stemme in jou biblioteek nie — voeg eers stemme by /voices."
                  : "No voices in your library — add some on /voices first."}
              </div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {library.map((v) => {
                  const checked = castIds.has(v.id);
                  return (
                    <label
                      key={v.id}
                      className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
                        checked ? "border-foreground/60 bg-muted/40" : "border-border"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          setCastIds((prev) => {
                            const next = new Set(prev);
                            if (c) next.add(v.id);
                            else next.delete(v.id);
                            return next;
                          });
                        }}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{v.name}</div>
                        <div className="truncate text-muted-foreground">
                          {v.gender} · {v.age_band}
                          {v.accent_rating ? ` · ${"★".repeat(v.accent_rating)}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-exercise customisation */}
          <div className="space-y-2">
            <Label>{locale === "af" ? "Verfyn elke oefening (opsioneel)" : "Customise each exercise (optional)"}</Label>
            <p className="text-xs text-muted-foreground">
              {locale === "af"
                ? "Laat leeg vir AI-vrye-keuse. Vul slotte in om scenarios vas te lê."
                : "Leave blank to let the AI choose freely. Fill slots to pin scenarios."}
            </p>
            <Accordion type="multiple" className="mt-2 rounded-md border border-border">
              {activeExercises.map((n) => {
                const cfg = EX_GUIDE[n];
                const st = perEx[n];
                return (
                  <AccordionItem key={n} value={`ex-${n}`} className="border-border">
                    <AccordionTrigger className="px-4">
                      <span className="text-sm font-medium">
                        {locale === "af" ? "Oefening" : "Exercise"} {n}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({cfg.slots} {cfg.slotLabel[locale].toLowerCase()}{cfg.slots > 1 ? "s" : ""})
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <p className="mb-3 text-xs text-muted-foreground">{cfg.exerciseHint[locale]}</p>
                      {n === 4 && (
                        <div className="mb-3 space-y-1.5">
                          <Label htmlFor={`shared-${n}`} className="text-xs">
                            {locale === "af" ? "Gedeelde tema vir die ses sprekers" : "Shared theme for the six speakers"}
                          </Label>
                          <Input
                            id={`shared-${n}`}
                            value={st.sharedTheme}
                            onChange={(e) => updateEx(n, { sharedTheme: e.target.value })}
                            placeholder={locale === "af" ? "Bv. ervarings met vrywilligerswerk" : "e.g. experiences with volunteering"}
                          />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor={`notes-${n}`} className="text-xs">
                          {locale === "af" ? "Algemene notas" : "General notes"}
                        </Label>
                        <Textarea
                          id={`notes-${n}`}
                          rows={2}
                          value={st.notes}
                          onChange={(e) => updateEx(n, { notes: e.target.value })}
                          placeholder={locale === "af" ? "Bv. fokus op tienertaal en informele register." : "e.g. focus on teen language and informal register."}
                        />
                      </div>
                      <div className="mt-4 grid gap-2">
                        {st.slots.map((v, i) => (
                          <div key={i} className="space-y-1">
                            <Label htmlFor={`slot-${n}-${i}`} className="text-xs">
                              {cfg.slotLabel[locale]} {i + 1}
                            </Label>
                            <Textarea
                              id={`slot-${n}-${i}`}
                              rows={2}
                              value={v}
                              onChange={(e) => updateSlot(n, i, e.target.value)}
                              placeholder={cfg.perSlotPlaceholder[locale]}
                            />
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">{t("new.cost")}</span>
            <Button type="submit" disabled={busy}>
              {busy ? t("new.generating") : t("new.generate")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
