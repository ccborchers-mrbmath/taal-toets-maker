import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop")({
  head: () => ({ meta: [{ title: "Winkel — Luister Lab" }] }),
  component: ShopPage,
});

function ShopPage() {
  return (
    <AppShell>
      <ShopContent />
    </AppShell>
  );
}

function ShopContent() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">{t("shop.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("shop.subtitle")}</p>
      <div className="paper mt-8 rounded-lg p-10 text-center text-sm text-muted-foreground">{t("shop.empty")}</div>
    </div>
  );
}
