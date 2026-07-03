// Server-only credit helpers. Wraps the SECURITY DEFINER RPCs added in the
// credit-system migration. Never import from a *.functions.ts module scope —
// import inside a handler (`await import("@/lib/credits.server")`).

export type CreditOp =
  | "text_paper"
  | "image_option"
  | "audio_exercise"
  | "segment_regenerate";

const UNLIMITED_EMAILS = new Set([
  "burger.tammy@gmail.com",
  "ccborchers@gmail.com",
]);

export function isUnlimitedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return UNLIMITED_EMAILS.has(email.toLowerCase());
}

export async function getCreditCost(op: CreditOp): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_credit_cost", { _op: op });
  if (error) throw new Error(`Cost lookup failed: ${error.message}`);
  if (typeof data !== "number") throw new Error(`Unknown credit op: ${op}`);
  return data;
}

export async function getAvailableCredits(userId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_available_credits", { _user_id: userId });
  if (error) throw new Error(`Balance lookup failed: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/**
 * Atomically spend `amount` credits (or the cost of `op` if amount omitted).
 * Returns the new available balance. Throws "Insufficient credits" if short.
 * Unlimited users are exempted and the call becomes a no-op returning -1.
 */
export async function spendCredits(opts: {
  userId: string;
  userEmail?: string | null;
  op: CreditOp;
  amount?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ spent: number; balance: number; unlimited: boolean }> {
  if (isUnlimitedEmail(opts.userEmail)) {
    return { spent: 0, balance: -1, unlimited: true };
  }
  const amount = opts.amount ?? (await getCreditCost(opts.op));
  if (amount <= 0) {
    return { spent: 0, balance: await getAvailableCredits(opts.userId), unlimited: false };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("spend_credits", {
    _user_id: opts.userId,
    _amount: amount,
    _reason: opts.reason ?? opts.op,
    _metadata: (opts.metadata ?? {}) as never,
  });
  if (error) {
    // Postgres raises P0001 for our custom "Insufficient credits" error.
    if (typeof error.message === "string" && error.message.toLowerCase().includes("insufficient")) {
      throw new Error("Insufficient credits");
    }
    throw new Error(`Spend failed: ${error.message}`);
  }
  return { spent: amount, balance: typeof data === "number" ? data : 0, unlimited: false };
}

/** Refund a previously-spent amount (used when downstream generation fails). */
export async function refundCredits(opts: {
  userId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (opts.amount <= 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("grant_credits", {
    _user_id: opts.userId,
    _amount: opts.amount,
    _source: "refund",
    _metadata: { ...(opts.metadata ?? {}), refund_reason: opts.reason } as never,
  });
  if (error) throw new Error(`Refund failed: ${error.message}`);
}
