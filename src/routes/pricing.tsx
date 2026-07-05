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
  name: string;
  priceLabel: string;
  credits: number;
  papers: number;
  perks: { af: string[]; en: string[] };
};

type TopUp = {
  priceId: string;
  name: string;
  priceLabel: string;
  credits: number;
};

const TIERS: Tier[] = [
  {
    id: "basic",
    priceId: "basic_monthly",
    name: "Luister Lab — Basic",
    priceLabel: "R199",
    credits: 45,
    papers: 1,
    perks: {
      af: [
        "45 krediete per maand",
        "Genoeg vir een volledige luistervraestel plus ’n paar regstellings en beeld-hergenerasies",
        "PDF, memorandum, transkripsie en klankuitvoer is ingesluit wanneer krediete gebruik word",
        "Geen gratis proeftydperk nie; kanselleer enige tyd",
      ],
      en: [
        "45 credits per month",
        "Enough for one complete listening paper plus a few corrections and image regenerations",
        "PDF, mark scheme, transcript and audio export are included when credits are used",
        "No free trial; cancel anytime",
      ],
    },
  },
  {
    id: "pro",
    priceId: "pro_monthly",
    name: "Luister Lab — Pro",
    priceLabel: "R449",
    credits: 140,
    papers: 4,
    perks: {
      af: [
        "140 krediete per maand",
        "Genoeg vir ongeveer 4 volledige luistervraestelle",
        "PDF, memorandum, transkripsie en klankuitvoer is ingesluit wanneer krediete gebruik word",
        "Geen gratis proeftydperk nie; kanselleer enige tyd",
      ],
      en: [
        "140 credits per month",
        "Enough for about 4 complete listening papers",
        "PDF, mark scheme, transcript and audio export are included when credits are used",
        "No free trial; cancel anytime",
      ],
    },
  },
];

const TOPUPS: TopUp[] = [
  { priceId: "topup_small_once", name: "Top-up — 1 paper", priceLabel: "R99", credits: 35 },
  { priceId: "topup_large_once", name: "Top-up — 2 papers", priceLabel: "R179", credits: 70 },
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
      <p className="mt-2 text-xs text-muted-foreground">
        {af
          ? "Alle pryse is in Suid-Afrikaanse rand (ZAR) en sluit toepaslike belasting/BTW uit. Taxes may apply and will be calculated at checkout. Geen gratis proeftydperk nie — intekeninge hernu maandeliks totdat jy kanselleer."
          : "All prices are in South African rand (ZAR) and exclude applicable taxes/VAT. Taxes may apply and will be calculated at checkout. No free trial — subscriptions renew monthly until you cancel."}
      </p>

      <div className="paper mt-6 overflow-hidden rounded-lg">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-semibold">
            {af ? "Publieke pryslys" : "Public pricing"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {af
              ? "Hierdie produkname en pryse stem ooreen met wat by checkout gewys word."
              : "These product names and prices match what is shown at checkout."}
          </p>
        </div>
        <div className="divide-y divide-border text-sm">
          {[...TIERS, ...TOPUPS].map((item) => {
            const tier = TIERS.find((plan) => plan.priceId === item.priceId);
            const monthly = tier !== undefined;
            return (
              <div key={item.priceId} className="grid gap-2 px-4 py-3 sm:grid-cols-[1.4fr_0.8fr_1.6fr] sm:items-center">
                <div className="font-medium">{item.name}</div>
                <div className="font-display text-lg">
                  {item.priceLabel}
                  <span className="font-sans text-xs text-muted-foreground">
                    {monthly ? (af ? " / maand" : " / month") : af ? " eenmalig" : " one-off"}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {monthly
                    ? af
                      ? `${item.credits} krediete per maand; ongeveer ${tier.papers} volledige luistervraestelle.`
                      : `${item.credits} credits per month; about ${tier.papers} complete listening papers.`
                    : af
                      ? `${item.credits} top-up krediete; verval nie.`
                      : `${item.credits} top-up credits; never expires.`}
                </div>
              </div>
            );
          })}
        </div>
      </div>


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
                <div className="font-display text-lg font-semibold">{tier.name}</div>
                {isCurrent && (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent-foreground">
                    {af ? "Huidige plan" : "Current plan"}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-3xl">{tier.priceLabel}</span>
                <span className="text-sm text-muted-foreground">/{af ? "maand" : "mo"}</span>
                <span className="ml-1 text-xs text-muted-foreground">{af ? "excl. BTW" : "excl. tax"}</span>
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
                disabled={loading || isActive || !user}
                onClick={() => handleBuy(tier.priceId)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCurrent
                  ? af ? "Aktief" : "Active"
                  : isActive
                    ? af ? "Verander op Rekening" : "Switch on Account"
                    : af ? "Teken in op " + tier.name : "Subscribe to " + tier.name}
              </button>
            </div>
          );
        })}
      </div>

      {isActive && (
        <p className="mt-3 text-xs text-muted-foreground">
          {af
            ? "Jy het reeds ’n aktiewe intekening. Verander plan op die "
            : "You already have an active subscription. Switch plans on the "}
          <Link to="/account" className="underline">
            {af ? "Rekening-bladsy" : "Account page"}
          </Link>
          .
        </p>
      )}


      {/* Top-ups */}
      <h2 className="mt-10 font-display text-xl font-semibold">
        {af ? "Eenmalige top-ups" : "One-off top-ups"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {af
          ? "Ekstra krediete wat nooit verval nie. Produkname en pryse is dieselfde by checkout."
          : "Extra credits that never expire. Product names and prices are the same at checkout."}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {TOPUPS.map((tp) => (
          <div key={tp.priceId} className="paper rounded-lg p-6">
            <div className="font-display text-lg font-semibold">{tp.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-2xl">{tp.priceLabel}</span>
              <span className="ml-1 text-xs text-muted-foreground">{af ? "eenmalig · excl. BTW" : "one-off · excl. tax"}</span>
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
