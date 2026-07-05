import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { toast } from "sonner";

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

type Tier = {
  id: "basic" | "pro";
  priceId: string;
  name: { af: string; en: string };
  priceLabel: string;
  credits: number;
  papers: number;
  perks: { af: string[]; en: string[] };
};

type TopUp = {
  priceId: string;
  name: { af: string; en: string };
  priceLabel: string;
  credits: number;
};

const TIERS: Tier[] = [
  {
    id: "basic",
    priceId: "basic_monthly",
    name: { af: "Basies", en: "Basic" },
    priceLabel: "R149",
    credits: 70,
    papers: 2,
    perks: {
      af: ["70 krediete per maand", "Genoeg vir ±2 volle vraestelle", "Ongebruikte krediete rol een siklus oor", "Kanselleer enige tyd"],
      en: ["70 credits per month", "Enough for ~2 full papers", "Unused credits roll over one cycle", "Cancel anytime"],
    },
  },
  {
    id: "pro",
    priceId: "pro_monthly",
    name: { af: "Pro", en: "Pro" },
    priceLabel: "R329",
    credits: 160,
    papers: 5,
    perks: {
      af: ["160 krediete per maand", "Genoeg vir ±5 volle vraestelle", "Ongebruikte krediete rol een siklus oor", "Kanselleer enige tyd"],
      en: ["160 credits per month", "Enough for ~5 full papers", "Unused credits roll over one cycle", "Cancel anytime"],
    },
  },
];

const TOPUPS: TopUp[] = [
  { priceId: "topup_small_once", name: { af: "1 vraestel", en: "1 paper" }, priceLabel: "R79", credits: 35 },
  { priceId: "topup_large_once", name: { af: "2 vraestelle", en: "2 papers" }, priceLabel: "R149", credits: 65 },
];

function PricingContent() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { subscription, isActive } = useSubscription();
  const { openCheckout, loading } = usePaddleCheckout();
  const af = locale === "af";

  const currentTier = isActive ? subscription?.tier : null;

  const handleBuy = async (priceId: string) => {
    if (!user) {
      toast.error(af ? "Teken eers in" : "Please sign in first");
      return;
    }
    try {
      await openCheckout({
        priceId,
        customerEmail: user.email ?? undefined,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/checkout/success`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">{t("pricing.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("pricing.subtitle")}</p>

      {!user && (
        <div className="paper mt-6 rounded-lg p-4 text-sm">
          <Link to="/auth" className="underline">
            {af ? "Teken in om te koop" : "Sign in to purchase"}
          </Link>
        </div>
      )}

      {/* Monthly plans */}
      <h2 className="mt-10 font-display text-xl font-semibold">
        {af ? "Maandelikse planne" : "Monthly plans"}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {TIERS.map((tier) => {
          const isCurrent = currentTier === tier.id;
          return (
            <div key={tier.id} className="paper rounded-lg p-6">
              <div className="flex items-baseline justify-between">
                <div className="font-display text-lg font-semibold">{tier.name[locale]}</div>
                {isCurrent && (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent-foreground">
                    {af ? "Huidige plan" : "Current plan"}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-3xl">{tier.priceLabel}</span>
                <span className="text-sm text-muted-foreground">/{af ? "maand" : "mo"}</span>
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {tier.credits} {t("credits.label")}
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {tier.perks[locale].map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={loading || isCurrent || !user}
                onClick={() => handleBuy(tier.priceId)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCurrent
                  ? af ? "Aktief" : "Active"
                  : af ? "Teken in op " + tier.name.af : "Subscribe to " + tier.name.en}
              </button>
            </div>
          );
        })}
      </div>

      {/* Top-ups */}
      <h2 className="mt-10 font-display text-xl font-semibold">
        {af ? "Eenmalige top-ups" : "One-off top-ups"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {af
          ? "Ekstra krediete wat nooit verval nie."
          : "Extra credits that never expire."}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {TOPUPS.map((tp) => (
          <div key={tp.priceId} className="paper rounded-lg p-6">
            <div className="font-display text-lg font-semibold">{tp.name[locale]}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-2xl">{tp.priceLabel}</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {tp.credits} {t("credits.label")}
            </div>
            <button
              type="button"
              disabled={loading || !user}
              onClick={() => handleBuy(tp.priceId)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {af ? "Koop" : "Buy"}
            </button>
          </div>
        ))}
      </div>

      {user && (
        <div className="mt-10 text-sm text-muted-foreground">
          <Link to="/account" className="underline">
            {af ? "Bestuur intekening" : "Manage subscription"}
          </Link>
        </div>
      )}
    </div>
  );
}
