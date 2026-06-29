import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pryse — Luister Lab" }] }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <AppShell requireAuth={false}>
      <PricingContent />
    </AppShell>
  );
}

function PricingContent() {
  const { t } = useT();
  const tiers = [
    { name: "Starter", credits: 5, price: "R 79" },
    { name: "Standard", credits: 20, price: "R 249" },
    { name: "Pro", credits: 60, price: "R 599" },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">{t("pricing.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("pricing.subtitle")}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {tiers.map((tier) => (
          <div key={tier.name} className="paper rounded-lg p-6 text-center">
            <div className="font-display text-lg font-semibold">{tier.name}</div>
            <div className="mt-2 font-display text-3xl">{tier.price}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{tier.credits} {t("credits.label")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
