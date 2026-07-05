import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Diensbepalings — Luister Lab" }] }),
  component: TermsPage,
});

function TermsPage() {
  const { user } = useAuth();
  const Content = (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">Diensbepalings</h1>
      <p className="mt-2 text-xs text-muted-foreground">Laas opgedateer: {new Date().toLocaleDateString("af-ZA")}</p>

      <Section title="1. Wie ons is">
        Luister Lab ("die diens") word bedryf deur <strong>Chirstopher Charkes Borchers</strong>
        ("ons", "die verkoper"). Deur die diens te gebruik of 'n rekening te skep, stem jy in tot
        hierdie bepalings. Indien jy nie instem nie, moet jy die diens nie gebruik nie.
      </Section>

      <Section title="2. Die diens">
        Luister Lab is 'n onafhanklike hulpmiddel om Afrikaans as 'n Tweede Taal
        luister-oefenvraestelle te genereer. Die diens is <em>nie</em> 'n eksamenraad, kurrikulum-
        of assesseringsverskaffer nie, en is nie geaffilieer met, ondersteun deur, of endosseer
        deur enige eksamenraad, universiteit of amptelike kurrikulum-liggaam nie. Gegenereerde
        inhoud is generiese oefenmateriaal en moet deur 'n opvoeder hersien word voor gebruik.
      </Section>

      <Section title="3. Rekeninge">
        Jy moet akkurate inligting verskaf en jou aanmeldbesonderhede vertroulik hou. Jy is
        verantwoordelik vir alle aktiwiteit onder jou rekening. Jy moet die wettige ouderdom hê
        (of ouerlike toestemming) om die diens te gebruik.
      </Section>

      <Section title="4. Aanvaarbare gebruik / misbruik">
        Jy stem in om die diens NIE te gebruik om:
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>enige onwettige, bedrieglike, haatlike of skadelike inhoud te skep of te versprei;</li>
          <li>intellektuele eiendom te skend of derde-party regte te oortree;</li>
          <li>die diens te ontleed, te reverse-engineer, te omseil of oorlaadings-aanvalle uit te voer;</li>
          <li>toegang te bekom sonder magtiging, of 'n ander gebruiker se rekening te gebruik;</li>
          <li>skadelike sagteware, malware of outomatiese skraap-gereedskap teen die diens te gebruik.</li>
        </ul>
      </Section>

      <Section title="5. KI-uitsette en akkuraatheid">
        Vraestelle word deur KI-modelle gegenereer. Uitsette kan onakkuraat, onvolledig of
        onvanpas wees en is nie 'n plaasvervanger vir professionele onderrig of amptelike
        eksamen- of kurrikulum-materiaal nie. Jy is verantwoordelik vir jou aanwysings, om
        uitsette te hersien, en om te bevestig dat jy die reg het om enige insetinhoud te gebruik.
      </Section>

      <Section title="6. Intellektuele eiendom">
        Ons behou eienaarskap van die diens, die sagteware, handelsmerke en dokumentasie. Jy behou
        die regte op inhoud wat jy verskaf; jy verleen ons 'n beperkte lisensie om dit te verwerk
        slegs vir die doeleindes van die lewering van die diens aan jou.
      </Section>

      <Section title="7. Betalings, subskripsies en Paddle as Merchant of Record">
        Ons bestellingsproses word deur ons aanlyn-verkoper <strong>Paddle.com Market Ltd</strong>
        uitgevoer. <strong>Paddle.com is die Merchant of Record vir al ons bestellings.</strong> Paddle
        hanteer alle klantediens-navrae oor betaling, fakture, belasting en verwerk terugbetalings.
        Betaling-, subskripsie-, vernuwings-, kansellasie- en terugbetalingsmeganika word beheer
        deur Paddle se{" "}
        <a
          href="https://www.paddle.com/legal/checkout-buyer-terms"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >Checkout Buyer Terms</a>. Prys- en produkbeskrywings verskyn tydens uitcheck.
      </Section>

      <Section title="8. Terugbetalings">
        Sien ons <Link to="/refunds" className="underline">terugbetalingsbeleid</Link>. Terugbetalings
        word deur Paddle verwerk.
      </Section>

      <Section title="9. Diensvlak &amp; waarborg-uitsluiting">
        Die diens word "soos dit is" en "soos beskikbaar" gelewer. Ons waarborg nie ononderbroke of
        foutlose werking nie en sluit, tot die maksimum wat die wet toelaat, alle stilswyende
        waarborge uit (verhandelbaarheid, geskiktheid vir 'n doel, nie-oortreding).
      </Section>

      <Section title="10. Aanspreeklikheid">
        Ons totale aanspreeklikheid vir enige eis is beperk tot die bedrag wat jy in die voorafgaande
        12 maande aan die diens betaal het. Ons is nie aanspreeklik vir indirekte, gevolglike of
        spesiale skade nie (o.a. verlies van wins, data of goodwill). Niks in hierdie bepalings
        beperk aanspreeklikheid vir bedrog, growwe nalatigheid, of dood/persoonlike besering wat deur
        die wet nie beperk kan word nie.
      </Section>

      <Section title="11. Skorsing en beëindiging">
        Ons kan jou toegang skors of beëindig by wesenlike oortreding van hierdie bepalings,
        onbetaling, sekuriteits-/bedrogrisiko, of herhaalde skending van aanvaarbare-gebruik-reëls.
        Jy kan jou rekening enige tyd kanselleer via die rekening-bladsy of deur ons te kontak.
      </Section>

      <Section title="12. Wysigings">
        Ons kan hierdie bepalings van tyd tot tyd bywerk. Wesenlike veranderinge sal per e-pos of
        via die toepassing aangekondig word. Voortgesette gebruik nadat 'n opdatering effektief word
        geld as aanvaarding.
      </Section>

      <Section title="13. Toepaslike reg">
        Hierdie bepalings word beheer deur die wette van die Republiek van Suid-Afrika, sonder
        inagneming van botsings-van-reg-beginsels. Dispute word onderworpe aan die eksklusiewe
        jurisdiksie van die Suid-Afrikaanse howe, behalwe waar 'n verpligte plaaslike wet andersins
        vereis.
      </Section>

      <Section title="14. Kontak">
        Kontak ons vir enige vrae oor hierdie bepalings via die ondersteuningskanaal binne die
        toepassing.
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
