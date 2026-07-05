import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription, isPastDue } from "@/hooks/useSubscription";
import { createCustomerPortalSession, switchSubscriptionPlan } from "@/utils/payments.functions";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Rekening — Luister Lab" }] }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <AppShell>
      <AccountContent />
    </AppShell>
  );
}

const PLAN_LABEL: Record<string, { af: string; en: string; credits: number }> = {
  basic_monthly: { af: "Basies (R149/m)", en: "Basic (R149/mo)", credits: 70 },
  pro_monthly: { af: "Pro (R329/m)", en: "Pro (R329/mo)", credits: 160 },
};
const ALL_PLAN_IDS = ["basic_monthly", "pro_monthly"] as const;

function AccountContent() {
  const { locale } = useT();
  const af = locale === "af";
  const { user } = useAuth();
  const { subscription, isActive, loading, refresh } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const pastDue = isPastDue(subscription);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await createCustomerPortalSession();
      const url = res.subscriptionUrls?.[0]?.cancelSubscription
        ?? res.subscriptionUrls?.[0]?.updateSubscriptionPaymentMethod
        ?? res.overviewUrl;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Portal error");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSwitch = async (newPriceId: string) => {
    setSwitchingTo(newPriceId);
    try {
      await switchSubscriptionPlan({ data: { newPriceId } });
      toast.success(af ? "Plan verander" : "Plan switched");
      // Give the webhook a moment then refresh.
      setTimeout(() => { void refresh(); }, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Switch failed");
    } finally {
      setSwitchingTo(null);
    }
  };


  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(af ? "af-ZA" : "en-ZA", {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">
        {af ? "Rekening" : "Account"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>

      {pastDue && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-2">
            <p className="font-medium">
              {af ? "Betaling het misluk" : "Payment failed"}
            </p>
            <p className="text-muted-foreground">
              {af
                ? "Ons kon nie jou laaste betaling verwerk nie. Jou krediete is opgeskort totdat betaling opdateer word."
                : "We couldn't process your latest payment. Your credits are suspended until the payment method is updated."}
            </p>
            <button
              type="button"
              onClick={openPortal}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {portalLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              {af ? "Werk betaalmetode op" : "Update payment method"}
            </button>
          </div>
        </div>
      )}

      <section className="paper mt-8 rounded-lg p-6">
        <h2 className="font-display text-lg font-semibold">
          {af ? "Intekening" : "Subscription"}
        </h2>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {af ? "Laai…" : "Loading…"}
          </div>
        ) : !subscription || (!isActive && !pastDue) ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-muted-foreground">
              {af ? "Geen aktiewe intekening nie." : "No active subscription."}
            </p>
            <Link to="/pricing" className="inline-block underline">
              {af ? "Bekyk pryse" : "View pricing"}
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <dl className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {af ? "Plan" : "Plan"}
                </dt>
                <dd className="mt-0.5 font-medium capitalize">{subscription.tier}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {af ? "Status" : "Status"}
                </dt>
                <dd className="mt-0.5 font-medium capitalize">
                  {subscription.status}
                  {subscription.cancel_at_period_end && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({af ? "kanselleer aan siklus-einde" : "cancels at period end"})
                    </span>
                  )}
                </dd>
              </div>
              {periodEnd && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {subscription.cancel_at_period_end
                      ? af ? "Toegang tot" : "Access until"
                      : af ? "Volgende hernuwing" : "Next renewal"}
                  </dt>
                  <dd className="mt-0.5 font-medium">{periodEnd}</dd>
                </div>
              )}
            </dl>

            {isActive && !subscription.cancel_at_period_end && (
              <div className="border-t border-border pt-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {af ? "Verander plan" : "Switch plan"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_PLAN_IDS.filter((id) => id !== subscription.price_id).map((id) => {
                    const label = PLAN_LABEL[id];
                    const busy = switchingTo === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleSwitch(id)}
                        disabled={switchingTo !== null}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                        {af ? `Verander na ${label.af}` : `Switch to ${label.en}`}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {af
                    ? "Opgraderings word onmiddellik pro-rata verreken en jy kry ekstra krediete."
                    : "Upgrades are prorated immediately and you receive the extra credits right away."}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={openPortal}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {portalLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {af ? "Bestuur / kanselleer" : "Manage / cancel"}
              </button>
              <Link
                to="/pricing"
                className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium underline"
              >
                {af ? "Koop top-up" : "Buy top-up"}
              </Link>
            </div>
          </div>
        )}
      </section>


      <p className="mt-6 text-xs text-muted-foreground">
        {af
          ? "Betalings word deur Paddle verwerk. Kanseleer enige tyd — krediete bly geldig tot einde van huidige siklus."
          : "Payments are processed by Paddle. Cancel anytime — credits remain valid until the end of the current billing cycle."}
      </p>
    </div>
  );
}
