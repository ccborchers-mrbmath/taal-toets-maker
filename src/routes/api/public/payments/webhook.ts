// Paddle webhook handler. Signature-verified via verifyWebhook.
// Routes: subscription lifecycle → subscriptions table,
// transaction.completed → credit grants (subscription cycles + top-ups).
import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhook, EventName, type PaddleEnv } from "@/lib/paddle.server";

async function getSupabase() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function tierFromPriceId(priceId: string | undefined): string | null {
  if (priceId === "basic_monthly") return "basic";
  if (priceId === "pro_monthly") return "pro";
  return null;
}

function monthlyCreditsFor(priceId: string | undefined): number | null {
  if (priceId === "basic_monthly") return 70;
  if (priceId === "pro_monthly") return 160;
  return null;
}

async function handleSubscriptionCreated(data: any, env: PaddleEnv) {
  const userId = data.customData?.userId;
  if (!userId) {
    console.warn("[paddle-webhook] subscription.created missing customData.userId");
    return;
  }
  const item = data.items?.[0];
  const priceId = item?.price?.importMeta?.externalId as string | undefined;
  const productId = item?.product?.importMeta?.externalId as string | undefined;
  if (!priceId || !productId) {
    console.warn("[paddle-webhook] missing importMeta.externalId", {
      rawPriceId: item?.price?.id,
      rawProductId: item?.product?.id,
    });
    return;
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      provider: "paddle",
      provider_subscription_id: data.id,
      provider_customer_id: data.customerId,
      product_id: productId,
      price_id: priceId,
      tier: tierFromPriceId(priceId),
      monthly_credits: monthlyCreditsFor(priceId),
      status: data.status,
      current_period_start: data.currentBillingPeriod?.startsAt,
      current_period_end: data.currentBillingPeriod?.endsAt,
      cancel_at_period_end: data.scheduledChange?.action === "cancel",
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_subscription_id" },
  );
  if (error) console.error("[paddle-webhook] upsert failed:", error.message);
}

async function handleSubscriptionUpdated(data: any, env: PaddleEnv) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: data.status,
      current_period_start: data.currentBillingPeriod?.startsAt,
      current_period_end: data.currentBillingPeriod?.endsAt,
      cancel_at_period_end: data.scheduledChange?.action === "cancel",
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", data.id)
    .eq("environment", env);
  if (error) console.error("[paddle-webhook] update failed:", error.message);
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("provider_subscription_id", data.id)
    .eq("environment", env);
  if (error) console.error("[paddle-webhook] cancel failed:", error.message);
}

// transaction.completed fires for initial subscription payment, renewals, and
// one-off top-up purchases. We use it as the credit-grant trigger.
async function handleTransactionCompleted(data: any, env: PaddleEnv) {
  const supabase = await getSupabase();
  const transactionId: string = data.id;
  const priceId = data.items?.[0]?.price?.importMeta?.externalId as string | undefined;
  if (!priceId) {
    console.warn("[paddle-webhook] transaction.completed missing importMeta.externalId");
    return;
  }

  // Locate the user via customData on the transaction, or via linked subscription.
  let userId: string | undefined = data.customData?.userId;

  if (data.subscriptionId) {
    // Subscription transaction (initial + every renewal) → grant monthly credits.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("user_id, current_period_end")
      .eq("provider_subscription_id", data.subscriptionId)
      .eq("environment", env)
      .maybeSingle();

    userId = userId ?? sub?.user_id ?? undefined;
    if (!userId) {
      console.warn("[paddle-webhook] no user for subscription txn", { transactionId });
      return;
    }
    const periodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end)
      : (data.billingPeriod?.endsAt ? new Date(data.billingPeriod.endsAt) : null);
    if (!periodEnd) {
      console.warn("[paddle-webhook] no period_end for grant", { transactionId });
      return;
    }
    const { error } = await supabase.rpc("grant_subscription_credits", {
      _user_id: userId,
      _price_id: priceId,
      _period_end: periodEnd.toISOString(),
      _subscription_id: data.subscriptionId,
      _transaction_id: transactionId,
    });
    if (error) console.error("[paddle-webhook] grant_subscription_credits failed:", error.message);
    return;
  }

  // One-off top-up purchase → grant top-up credits (no expiry).
  if (!userId) {
    console.warn("[paddle-webhook] top-up missing customData.userId", { transactionId });
    return;
  }
  const { error } = await supabase.rpc("grant_topup_credits", {
    _user_id: userId,
    _price_id: priceId,
    _transaction_id: transactionId,
  });
  if (error) console.error("[paddle-webhook] grant_topup_credits failed:", error.message);
}

async function handleWebhook(request: Request, env: PaddleEnv) {
  const event = await verifyWebhook(request, env);
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
      await handleSubscriptionCreated(event.data as any, env);
      break;
    case EventName.SubscriptionUpdated:
      await handleSubscriptionUpdated(event.data as any, env);
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data as any, env);
      break;
    case EventName.TransactionCompleted:
      await handleTransactionCompleted(event.data as any, env);
      break;
    default:
      console.log("[paddle-webhook] unhandled event:", event.eventType);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = (url.searchParams.get("env") || "sandbox") as PaddleEnv;
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("[paddle-webhook] error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
