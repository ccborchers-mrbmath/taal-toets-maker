import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";

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

function EditorContent() {
  const { id } = Route.useParams();
  const { t } = useT();

  const { data: assessment, isLoading } = useQuery({
    queryKey: ["assessment", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("editor.backLibrary")}
      </Link>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : !assessment ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("common.error")}</div>
      ) : (
        <div className="paper rounded-lg p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{assessment.paper_code}</div>
              <h1 className="mt-1 font-display text-2xl font-semibold">{assessment.title}</h1>
            </div>
            <span className="exam-stamp">{assessment.status}</span>
          </div>

          <div className="mt-8 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("editor.notReady")}
          </div>
        </div>
      )}
    </div>
  );
}
