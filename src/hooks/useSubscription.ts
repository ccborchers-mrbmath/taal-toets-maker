import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPaddleEnvironment } from "@/lib/paddle";

export type SubscriptionRow = {
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  tier: string | null;
  price_id: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
};

export type SubscriptionState = {
  loading: boolean;
  subscription: SubscriptionRow | null;
  isActive: boolean;
  refresh: () => Promise<void>;
};

function computeActive(sub: SubscriptionRow | null): boolean {
  if (!sub) return false;
  const now = Date.now();
  const end = sub.current_period_end ? Date.parse(sub.current_period_end) : null;
  if (["active", "trialing", "past_due"].includes(sub.status)) {
    return end === null || end > now;
  }
  if (sub.status === "canceled") return end !== null && end > now;
  return false;
}

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);

  const load = async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    const env = getPaddleEnvironment();
    const { data } = await supabase
      .from("subscriptions")
      .select(
        "provider_subscription_id,provider_customer_id,tier,price_id,status,current_period_end,cancel_at_period_end,environment",
      )
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSubscription((data as SubscriptionRow | null) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    if (!user) return () => { cancelled = true; };
    const channel = supabase
      .channel(`sub:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return {
    loading,
    subscription,
    isActive: computeActive(subscription),
    refresh: load,
  };
}
