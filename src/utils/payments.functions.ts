// Server functions for payments: price resolution + customer portal.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gatewayFetch, getPaddleClient, type PaddleEnv } from "@/lib/paddle.server";

const paddleEnvSchema = z.enum(["sandbox", "live"]);

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) =>
    z.object({ priceId: z.string().min(1), environment: paddleEnvSchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const res = await gatewayFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    if (!json.data?.length) throw new Error(`Paddle price not found: ${data.priceId}`);
    return json.data[0].id;
  });

// Opens Paddle's hosted customer portal for the caller's active subscription.
// Returns a temporary URL — the client should window.open it in a new tab.
export const createCustomerPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("provider_customer_id, provider_subscription_id, environment")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub?.provider_customer_id) throw new Error("No subscription found");

    const paddle = getPaddleClient(sub.environment as PaddleEnv);
    const subscriptionIds = sub.provider_subscription_id ? [sub.provider_subscription_id] : [];
    const portal = await paddle.customerPortalSessions.create(
      sub.provider_customer_id,
      subscriptionIds,
    );
    return {
      overviewUrl: portal.urls.general.overview,
      subscriptionUrls: portal.urls.subscriptions ?? [],
    };
  });

// Switch the caller's active subscription to a new plan (upgrade or downgrade).
// Uses Paddle's subscription-update API with prorated_immediately, so upgrades
// charge/credit the pro-rata difference now. The `subscription.updated`
// webhook then updates the DB row and grants upgrade credits (if applicable).
export const switchSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { newPriceId: string }) =>
    z.object({ newPriceId: z.string().min(1) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("provider_subscription_id, environment, status, price_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub?.provider_subscription_id) throw new Error("No subscription to switch");
    if (!["active", "trialing"].includes(sub.status)) {
      throw new Error(`Cannot switch a ${sub.status} subscription`);
    }
    if (sub.price_id === data.newPriceId) {
      throw new Error("Already on that plan");
    }

    const env = sub.environment as PaddleEnv;

    // Resolve external_id → real Paddle price id.
    const priceRes = await gatewayFetch(
      env,
      `/prices?external_id=${encodeURIComponent(data.newPriceId)}`,
    );
    const priceJson = (await priceRes.json()) as { data?: Array<{ id: string }> };
    if (!priceJson.data?.length) throw new Error(`Price not found: ${data.newPriceId}`);
    const paddlePriceId = priceJson.data[0].id;

    const paddle = getPaddleClient(env);
    await paddle.subscriptions.update(sub.provider_subscription_id, {
      items: [{ priceId: paddlePriceId, quantity: 1 }],
      prorationBillingMode: "prorated_immediately",
    });

    return { ok: true };
  });

