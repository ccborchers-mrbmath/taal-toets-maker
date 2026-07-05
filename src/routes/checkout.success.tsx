import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/checkout/success")({
  head: () => ({ meta: [{ title: "Betaling gelukkig — Luister Lab" }] }),
  component: CheckoutSuccessPage,
});

function CheckoutSuccessPage() {
  return (
    <AppShell requireAuth={false}>
      <Content />
    </AppShell>
  );
}

function Content() {
  const { locale } = useT();
  const af = locale === "af";
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <CheckCircle2 className="mx-auto h-12 w-12 text-accent" />
      <h1 className="mt-4 font-display text-3xl font-semibold">
        {af ? "Dankie!" : "Thank you!"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {af
          ? "Jou betaling is ontvang. Krediete verskyn binne 'n paar sekondes in jou rekening."
          : "Your payment is confirmed. Credits will appear in your account within a few seconds."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link
          to="/dashboard"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {af ? "Terug na biblioteek" : "Back to library"}
        </Link>
        <Link
          to="/account"
          className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {af ? "Bekyk rekening" : "View account"}
        </Link>
      </div>
    </div>
  );
}
