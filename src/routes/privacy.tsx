import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privaatheidsbeleid — Luister Lab" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { user } = useAuth();
  const Content = (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">Privaatheidsbeleid</h1>
      <p className="mt-2 text-xs text-muted-foreground">Laas opgedateer: {new Date().toLocaleDateString("af-ZA")}</p>

      <Section title="1. Wie ons is">
        Hierdie diens ("Luister Lab") word bedryf deur <strong>Chirstopher Charkes Borchers</strong>
        ("ons", "die verkoper"). Ons tree op as die <em>data-beheerder</em> vir persoonlike inligting
        wat deur die diens verwerk word. Kontak ons vir enige privaatheids-navrae via die
        ondersteuningskanaal in die toepassing.
      </Section>

      <Section title="2. Watter inligting ons versamel">
        <ul className="list-disc pl-5 space-y-1">
          <li>Rekening: e-posadres, geïnkripteerde wagwoord of OAuth-identifiseerder (Google).</li>
          <li>Gebruikinligting: vraestelle wat jy skep, krediet-transaksies, verwysings-metadata.</li>
          <li>Tegniese: IP-adres, blaaier-agent en fout-logs vir sekuriteit en foutopsporing.</li>
          <li>Ondersteuningsboodskappe wat jy aan ons stuur.</li>
        </ul>
        <p className="mt-2">
          Betalingsdata (kaartnommers, faktuuradres, BTW-status) word direk deur ons betaalverskaffer
          Paddle versamel en verwerk — ons ontvang of stoor nooit jou kaartinligting nie.
        </p>
      </Section>

      <Section title="3. Waarvoor ons dit gebruik en die regsgrondslag">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Lewer die diens</strong> (kontrak-uitvoering): rekeningskepping, vraestelgenerering, krediet-balans.</li>
          <li><strong>Betalings &amp; fakturering</strong> (kontrak-uitvoering, wettige verpligting): via Paddle as Merchant of Record.</li>
          <li><strong>Sekuriteit &amp; bedrogvoorkoming</strong> (regmatige belang): opsporing van misbruik en foutlogs.</li>
          <li><strong>Ondersteuning</strong> (kontrak-uitvoering): beantwoord jou navrae.</li>
          <li><strong>Produkverbetering</strong> (regmatige belang): saamgevoegde gebruikstatistieke.</li>
        </ul>
      </Section>

      <Section title="4. Met wie ons dit deel">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Paddle.com Market Ltd</strong> — Merchant of Record vir alle bestellings, subskripsies, terugbetalings en belasting-nakoming.</li>
          <li><strong>Diensverskaffers</strong>: hosting (Cloudflare), databasis en verifikasie (Supabase), e-pos-aflewering, klank- en KI-generering-verskaffers wat ons agter-die-skerms gebruik.</li>
          <li><strong>Professionele adviseurs</strong> (regs- of rekenmeesterlike) waar nodig.</li>
          <li><strong>Owerhede</strong> waar die wet dit vereis.</li>
        </ul>
        <p className="mt-2">Ons verkoop nooit persoonlike inligting nie.</p>
      </Section>

      <Section title="5. Internasionale oordragte">
        Party van ons diensverskaffers is buite Suid-Afrika/die EER geleë. Waar van toepassing gebruik
        ons standaard-kontraktuele klousules of soortgelyke waarborge om jou data te beskerm.
      </Section>

      <Section title="6. Retensie">
        Ons hou rekening-inligting terwyl jou rekening aktief is en tot 24 maande daarna vir wettige,
        boekhoukundige en dispuut-doeleindes. Fakturering-rekords wat deur Paddle bewaar word, volg
        Paddle se eie retensieperiodes (tipies 7 jaar vir belastingnakoming). Fout-logs word binne 90
        dae verwyder of anoniem gemaak.
      </Section>

      <Section title="7. Jou regte">
        Jy kan versoek om jou data te sien, reg te stel, uit te vee, oor te dra of om verwerking te
        beperk. Waar ons op toestemming staatmaak, kan jy dit enige tyd onttrek. Kontak ons via
        ondersteuning. Jy het ook die reg om by 'n toesighoudende owerheid 'n klagte in te dien.
      </Section>

      <Section title="8. Sekuriteit">
        Ons pas gepaste tegniese en organisatoriese maatreëls toe: TLS-in-transito, geïnkripteerde
        databasis-berging, rolgebaseerde toegang, RLS-beleide en gereelde afhanklikheid-opdaterings.
      </Section>

      <Section title="9. Koekies">
        Ons gebruik slegs noodsaaklike koekies om jou sessie in stand te hou en die diens te lewer.
        Ons gebruik nie bemarkings- of derdeparty-analitiek-koekies nie.
      </Section>

      <Section title="10. Veranderinge">
        Ons kan hierdie beleid opdateer; wesenlike veranderinge sal per e-pos of via die toepassing
        aangekondig word.
      </Section>

      <p className="mt-8 text-xs text-muted-foreground">
        Sien ook ons <Link to="/terms" className="underline">Bepalings</Link> en{" "}
        <Link to="/refunds" className="underline">Terugbetalingsbeleid</Link>.
      </p>
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
