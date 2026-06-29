import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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

function NewAssessmentForm() {
  const { t } = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("assessments")
        .insert({
          created_by: user.id,
          title: title.trim() || "Untitled Paper",
          theme_hint: theme.trim() || null,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      // Generation pipeline lands in the next iteration. For now, navigate to the editor.
      navigate({ to: "/assessments/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(t("common.error"), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("new.backLibrary")}
      </Link>
      <div className="paper rounded-lg p-8">
        <h1 className="font-display text-2xl font-semibold">{t("new.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("new.subtitle")}</p>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t("new.titleLabel")}</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("new.titlePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="theme">{t("new.themeLabel")}</Label>
            <Textarea id="theme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={t("new.themePlaceholder")} rows={3} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("new.cost")}</span>
            <Button type="submit" disabled={busy}>{busy ? t("new.generating") : t("new.generate")}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
