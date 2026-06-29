import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";

export function CreditBalance() {
  const { user } = useAuth();
  const { t } = useT();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("credit_balances").select("balance").eq("user_id", user.id).maybeSingle();
      if (!cancelled) setBalance(data?.balance ?? 0);
    };
    load();
    const channel = supabase
      .channel(`credits:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_balances", filter: `user_id=eq.${user.id}` }, (payload) => {
        const next = (payload.new as { balance?: number } | null)?.balance;
        if (typeof next === "number") setBalance(next);
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user) return null;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium">
      <Coins className="h-3.5 w-3.5 text-accent" />
      <span className="tabular-nums">{balance ?? "—"}</span>
      <span className="text-muted-foreground">{t("credits.label")}</span>
    </div>
  );
}
