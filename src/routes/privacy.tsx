import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privaatheid — Luister Lab" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <AppShell requireAuth={false}>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 prose prose-sm">
        <h1 className="font-display text-3xl font-semibold">Privaatheidsbeleid</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Luister Lab stoor jou rekeninginligting en die vraestelle wat jy genereer. Ons deel nooit jou
          inligting met derde partye nie, behalwe waar dit nodig is om die diens te lewer (betaalverwerking, e-pos).
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Vir versoeke aangaande jou data, kontak ondersteuning.</p>
      </article>
    </AppShell>
  );
}
