import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/refunds")({
  head: () => ({ meta: [{ title: "Terugbetalings — Luister Lab" }] }),
  component: RefundsPage,
});

function RefundsPage() {
  const { user } = useAuth();
  const Content = (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">Terugbetalingsbeleid</h1>
      <p className="mt-2 text-xs text-muted-foreground">Laas opgedateer: {new Date().toLocaleDateString("af-ZA")}</p>

      <Section title="Verkoper &amp; Merchant of Record">
        Luister Lab word deur <strong>Chirstopher Charkes Borchers</strong> bedryf. Alle bestellings
        word verwerk deur ons aanlyn-verkoper <strong>Paddle.com Market Ltd</strong>, wat as die
        Merchant of Record optree. Terugbetalings word deur Paddle hanteer volgens Paddle se{" "}
        <a href="https://www.paddle.com/legal/refund-policy" target="_blank" rel="noopener noreferrer" className="underline">
          amptelike terugbetalingsbeleid
        </a>.
      </Section>

      <Section title="14-dae waarborg">
        Ons bied 'n <strong>14-dae terugbetalings-waarborg</strong> op aankope. Indien jy nie
        tevrede is met jou aankoop nie, kan jy binne 14 dae ná die bestellingsdatum 'n terugbetaling
        aanvra.
      </Section>

      <Section title="Hoe om 'n terugbetaling aan te vra">
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Besoek <a href="https://paddle.net" target="_blank" rel="noopener noreferrer" className="underline">paddle.net</a>
            {" "}en tik die e-posadres wat jy vir die aankoop gebruik het in — Paddle stuur 'n skakel na jou bestellings
            waar jy 'n terugbetaling kan aanvra.
          </li>
          <li>
            Of kontak ons direk via die ondersteuningskanaal in die toepassing en ons help jou om
            die versoek by Paddle in te dien.
          </li>
        </ol>
        <p className="mt-2">
          Verwys asseblief na jou Paddle-bestellingsnommer (dit verskyn in jou kwitansie-e-pos).
        </p>
      </Section>

      <Section title="Gebruikte krediete">
        Wanneer krediete alreeds gebruik is om vraestelle te genereer, is die diens klaar gelewer.
        Ons sal steeds 'n redelike, pro-rata terugbetalingsversoek aan Paddle voorlê vir enige
        <strong> ongebruikte</strong> krediete binne die 14-dae venster. Die finale
        terugbetalings-besluit berus by Paddle as Merchant of Record.
      </Section>

      <Section title="Subskripsies">
        Jy kan jou subskripsie enige tyd via die <Link to="/pricing" className="underline">pryse</Link>-
        of rekening-bladsy kanselleer. Toegang bly aktief tot die einde van die betaalde periode.
        Terugbetalings buite die 14-dae venster is onderworpe aan Paddle se diskresie.
      </Section>

      <Section title="Kontak">
        Vir enige navrae oor terugbetalings, kontak ons via die ondersteuningskanaal of gaan direk
        na <a href="https://paddle.net" target="_blank" rel="noopener noreferrer" className="underline">paddle.net</a>.
      </Section>
    </article>
  );

  if (user) return <AppShell requireAuth={false}>{Content}</AppShell>;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">{Content}</main>
      <PublicFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 text-sm text-muted-foreground">
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
