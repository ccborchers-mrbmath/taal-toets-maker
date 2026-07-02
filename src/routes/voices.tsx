import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import {
  deleteVoice,
  listMyVoices,
  previewVoice,
  saveVoice,
  type CastVoice,
  type Suitability,
} from "@/lib/voice-cast.functions";

export const Route = createFileRoute("/voices")({
  head: () => ({ meta: [{ title: "Stemme — Luister Lab" }] }),
  component: VoicesPage,
});

function VoicesPage() {
  return (
    <AppShell>
      <VoicesContent />
    </AppShell>
  );
}

const ROLE_KEYS: { key: keyof Suitability; af: string; en: string }[] = [
  { key: "narrator", af: "Verteller", en: "Narrator" },
  { key: "ex1", af: "Oef 1 (kort opnames)", en: "Ex 1 (short)" },
  { key: "ex2", af: "Oef 2 (gesprekke)", en: "Ex 2 (dialogues)" },
  { key: "ex3", af: "Oef 3 (lang praatjie)", en: "Ex 3 (long talk)" },
  { key: "ex4", af: "Oef 4 (sprekerpassing)", en: "Ex 4 (matching)" },
  { key: "ex5_interviewer", af: "Oef 5 onderhoudvoerder", en: "Ex 5 interviewer" },
  { key: "ex5_interviewee", af: "Oef 5 gas", en: "Ex 5 guest" },
];

type SampleKey =
  | "narrator"
  | "ex1_item"
  | "ex2_dialogue"
  | "ex3_monologue"
  | "ex4_teen"
  | "ex5_interview";

const SAMPLES: {
  key: SampleKey;
  af: string;
  en: string;
  text: string;
}[] = [
  {
    key: "narrator",
    af: "Verteller (rubriek)",
    en: "Narrator (rubric)",
    text:
      "Goeiedag almal, en welkom by die luistereksamen. Jy sal elke opname twee keer hoor. Skryf jou antwoorde op die antwoordblad.",
  },
  {
    key: "ex1_item",
    af: "Oef 1 — kort mededeling",
    en: "Ex 1 — short announcement",
    text:
      "Aandag asseblief, aandag asseblief. Die trein na Kaapstad vertrek nou vanaf platform ses. Passasiers word versoek om dadelik in te klim.",
  },
  {
    key: "ex2_dialogue",
    af: "Oef 2 — gesprek",
    en: "Ex 2 — dialogue line",
    text:
      "Nee wat, ek dink nie ons gaan dit vandag maak nie. Die verkeer is verskriklik en die vergadering begin oor twintig minute.",
  },
  {
    key: "ex3_monologue",
    af: "Oef 3 — lang praatjie",
    en: "Ex 3 — long talk",
    text:
      "Toe ek nog op skool was, het ek nooit gedink ek sou eendag 'n dokter word nie. Dit was eers na my matriekjaar, toe ek 'n paar maande by 'n plaaslike hospitaal vrywillig gewerk het, dat ek besef het hierdie is my roeping.",
  },
  {
    key: "ex4_teen",
    af: "Oef 4 — tiener-spreker",
    en: "Ex 4 — teen speaker",
    text:
      "Ek geniet dit regtig om saans saam met my vriende rugby te oefen. Dit help my om die spanning van skoolwerk af te skud en ek slaap ook baie beter daarna.",
  },
  {
    key: "ex5_interview",
    af: "Oef 5 — onderhoud",
    en: "Ex 5 — interview",
    text:
      "Vertel vir ons, meneer Van Wyk, hoe het u belangstelling in bewaring begin? Nou ja, dit strek eintlik terug tot my kinderjare op die plaas naby Oudtshoorn, waar my oupa my alles van die veld en die diere geleer het.",
  },
];

function VoicesContent() {
  const { locale } = useT();
  const t = (af: string, en: string) => (locale === "af" ? af : en);
  const [rows, setRows] = useState<CastVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CastVoice> | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [sampleKey, setSampleKey] = useState<SampleKey>("narrator");

  async function refresh() {
    setLoading(true);
    try {
      setRows(await listMyVoices());
    } catch (e) {
      toast.error(t("Kon nie laai nie", "Failed to load"), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  function newVoice() {
    setEditing({
      voice_id: "",
      name: "",
      gender: "neutral",
      age_band: "adult",
      accent_rating: 4,
      accent_note: "",
      tags: [],
      suitability: { ex2: true, ex3: true, ex4: true } as Suitability,
      voice_settings: {},
      active: true,
    });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const payload = {
        ...(editing.id ? { id: editing.id } : {}),
        voice_id: (editing.voice_id ?? "").trim(),
        name: (editing.name ?? "").trim(),
        gender: (editing.gender as "male" | "female" | "neutral") ?? "neutral",
        age_band: (editing.age_band as CastVoice["age_band"]) ?? "adult",
        accent_rating: editing.accent_rating ?? 3,
        accent_note: editing.accent_note ?? null,
        tags: editing.tags ?? [],
        suitability: editing.suitability ?? {},
        voice_settings: editing.voice_settings ?? {},
        active: editing.active ?? true,
      };
      if (!payload.voice_id || !payload.name) {
        toast.error(t("Vul naam en stem-ID in", "Name and voice ID required"));
        setBusy(false);
        return;
      }
      await saveVoice({ data: payload });
      setEditing(null);
      await refresh();
      toast.success(t("Gestoor", "Saved"));
    } catch (e) {
      toast.error(t("Stoor misluk", "Save failed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("Vee hierdie stem uit?", "Delete this voice?"))) return;
    try {
      await deleteVoice({ data: { id } });
      await refresh();
    } catch (e) {
      toast.error(t("Vee uit misluk", "Delete failed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function preview(voice_id: string, settings?: CastVoice["voice_settings"]) {
    setPreviewing(voice_id);
    try {
      const res = await previewVoice({ data: { voice_id, voice_settings: settings } });
      const audio = new Audio(`data:${res.mime};base64,${res.base64}`);
      await audio.play();
    } catch (e) {
      toast.error(t("Voorskou misluk", "Preview failed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPreviewing(null);
    }
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name)), [rows]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        to="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("Terug", "Back")}
      </Link>

      <div className="paper rounded-lg p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">
              {t("Stem-biblioteek", "Voice library")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(
                "Toets stemme op ElevenLabs met Afrikaanse teks. Plak die stem-ID's hier (bv. MClEFoImJXBTgLwdLI5n) en merk hulle vir die geskikte rolle. Slegs hierdie stemme word vir jou vraestelle gebruik.",
                "Test voices on ElevenLabs with Afrikaans text. Paste their voice IDs here (e.g. MClEFoImJXBTgLwdLI5n) and mark them for the roles they suit. Only these voices will be used in your papers.",
              )}
            </p>
          </div>
          <Button onClick={newVoice} size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("Voeg stem by", "Add voice")}
          </Button>
        </div>

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Laai…", "Loading…")}
          </div>
        ) : sorted.length === 0 ? (
          <div className="mt-8 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("Nog geen stemme nie.", "No voices yet.")}
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("Naam", "Name")}</th>
                  <th className="px-3 py-2">{t("Geslag/Ouderdom", "Gender/Age")}</th>
                  <th className="px-3 py-2">{t("Aksent", "Accent")}</th>
                  <th className="px-3 py-2">{t("Rolle", "Roles")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{v.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{v.voice_id}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {v.gender} · {v.age_band}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {"★".repeat(v.accent_rating)}
                      {v.accent_note ? (
                        <div className="text-[11px] text-muted-foreground">{v.accent_note}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      <div className="flex flex-wrap gap-1">
                        {ROLE_KEYS.filter((r) => v.suitability?.[r.key]).map((r) => (
                          <span key={r.key} className="rounded bg-muted px-1.5 py-0.5">
                            {r[locale]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("Voorskou", "Preview")}
                          onClick={() => preview(v.voice_id, v.voice_settings)}
                          disabled={previewing === v.voice_id}
                        >
                          {previewing === v.voice_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(v)}
                        >
                          {t("Wysig", "Edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(v.id)}
                          title={t("Vee uit", "Delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
              <h2 className="font-display text-lg font-semibold">
                {editing.id ? t("Wysig stem", "Edit voice") : t("Nuwe stem", "New voice")}
              </h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="grid gap-1.5">
                  <Label htmlFor="v-name">{t("Naam (kort, vir scripts)", "Name (short, used in scripts)")}</Label>
                  <Input
                    id="v-name"
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Sarah"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="v-id">{t("ElevenLabs stem-ID", "ElevenLabs voice ID")}</Label>
                  <Input
                    id="v-id"
                    value={editing.voice_id ?? ""}
                    onChange={(e) => setEditing({ ...editing, voice_id: e.target.value })}
                    placeholder="MClEFoImJXBTgLwdLI5n"
                    className="font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>{t("Geslag", "Gender")}</Label>
                    <Select
                      value={editing.gender ?? "neutral"}
                      onValueChange={(v) => setEditing({ ...editing, gender: v as CastVoice["gender"] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{t("Manlik", "Male")}</SelectItem>
                        <SelectItem value="female">{t("Vroulik", "Female")}</SelectItem>
                        <SelectItem value="neutral">{t("Neutraal", "Neutral")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t("Ouderdom", "Age")}</Label>
                    <Select
                      value={editing.age_band ?? "adult"}
                      onValueChange={(v) => setEditing({ ...editing, age_band: v as CastVoice["age_band"] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="child">{t("Kind", "Child")}</SelectItem>
                        <SelectItem value="teen">{t("Tiener", "Teen")}</SelectItem>
                        <SelectItem value="young_adult">{t("Jong volwasse", "Young adult")}</SelectItem>
                        <SelectItem value="adult">{t("Volwasse", "Adult")}</SelectItem>
                        <SelectItem value="middle_aged">{t("Middeljarig", "Middle-aged")}</SelectItem>
                        <SelectItem value="elderly">{t("Bejaard", "Elderly")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("Aksent-kwaliteit (1–5)", "Accent quality (1–5)")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={editing.accent_rating ?? 3}
                    onChange={(e) =>
                      setEditing({ ...editing, accent_rating: Math.max(1, Math.min(5, Number(e.target.value) || 3)) })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("Aantekeninge oor klank", "Notes on sound")}</Label>
                  <Textarea
                    rows={2}
                    value={editing.accent_note ?? ""}
                    onChange={(e) => setEditing({ ...editing, accent_note: e.target.value })}
                    placeholder={t("Bv. werklik mooi Afrikaanse 'r'.", "e.g. nice Afrikaans 'r' rolls.")}
                  />
                </div>
                <div>
                  <Label>{t("Geskik vir rolle", "Suitable for roles")}</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-xs">
                    {ROLE_KEYS.map((r) => {
                      const checked = !!editing.suitability?.[r.key];
                      return (
                        <label key={r.key} className="flex items-center gap-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) =>
                              setEditing({
                                ...editing,
                                suitability: { ...(editing.suitability ?? {}), [r.key]: !!c },
                              })
                            }
                          />
                          <span>{r[locale]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={editing.active ?? true}
                    onCheckedChange={(c) => setEditing({ ...editing, active: !!c })}
                  />
                  {t("Aktief — beskikbaar vir vraestelle", "Active — available for papers")}
                </label>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editing.voice_id && preview(editing.voice_id, editing.voice_settings)}
                  disabled={!editing.voice_id || previewing === editing.voice_id}
                >
                  {previewing === editing.voice_id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t("Voorskou", "Preview")}
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                    {t("Kanselleer", "Cancel")}
                  </Button>
                  <Button onClick={save} disabled={busy}>
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {t("Stoor", "Save")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
