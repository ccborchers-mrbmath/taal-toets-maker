import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/refunds")({
  head: () => ({ meta: [{ title: "Terugbetalings — Luister Lab" }] }),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <AppShell requireAuth={false}>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">Terugbetalingsbeleid</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Ongebruikte krediete kan binne 14 dae na aankoop terugbetaal word. Krediete wat alreeds gebruik
          is om vraestelle te genereer, kan nie terugbetaal word nie.
        </p>
      </article>
    </AppShell>
  );
}
