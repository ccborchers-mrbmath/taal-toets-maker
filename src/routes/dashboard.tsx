import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Biblioteek — Luister Lab" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();

  const { data: assessments, isLoading } = useQuery({
    queryKey: ["assessments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, title, status, paper_code, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusLabel = (s: string) =>
    s === "ready" ? t("dashboard.status.ready")
    : s === "generating" ? t("dashboard.status.generating")
    : s === "failed" ? t("dashboard.status.failed")
    : t("dashboard.status.draft");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <Button onClick={() => navigate({ to: "/assessments/new" })}>
          <Plus className="mr-2 h-4 w-4" /> {t("dashboard.new")}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : !assessments || assessments.length === 0 ? (
        <div className="paper mx-auto max-w-lg rounded-lg p-10 text-center">
          <h2 className="font-display text-xl font-semibold">{t("dashboard.empty.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("dashboard.empty.body")}</p>
          <Button className="mt-6" onClick={() => navigate({ to: "/assessments/new" })}>
            <Plus className="mr-2 h-4 w-4" /> {t("dashboard.new")}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assessments.map((a) => (
            <li key={a.id}>
              <Link
                to="/assessments/$id"
                params={{ id: a.id }}
                className="paper block rounded-lg p-5 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-semibold leading-snug">{a.title}</h3>
                  <span className="exam-stamp">{statusLabel(a.status)}</span>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {a.paper_code} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
