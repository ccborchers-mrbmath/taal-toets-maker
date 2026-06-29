import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Bepalings — Luister Lab" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <AppShell requireAuth={false}>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-semibold">Diensbepalings</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Luister Lab is 'n hulpmiddel om oefenvraestelle te skep. Die diens is nie geaffilieer met of
          ondersteun deur Cambridge Assessment International Education nie. Gegenereerde inhoud is bedoel
          vir oefendoeleindes en moet deur 'n opvoeder hersien word voor gebruik.
        </p>
      </article>
    </AppShell>
  );
}
