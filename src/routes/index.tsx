import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Headphones, Sparkles, Mic2, FileText, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Luister Lab — Afrikaans Tweede Taal Luistervraestelgenereerder" },
      {
        name: "description",
        content:
          "Skep pasgemaakte Afrikaans as 'n Tweede Taal luister-oefenvraestelle met natuurlike stemme, PDF's en klankgrepe.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Headphones className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold">Luister Lab</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Afrikaans TT · Luister</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#features" className="hover:text-foreground">Kenmerke</a>
            <Link to="/pricing" className="hover:text-foreground">Pryse</Link>
            <Link to="/terms" className="hover:text-foreground">Bepalings</Link>
            <Link to="/privacy" className="hover:text-foreground">Privaatheid</Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">Teken in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Begin gratis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Vir Afrikaans as 'n Tweede Taal-opvoeders
            </div>
            <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Genereer Afrikaans as 'n Tweede Taal luister-oefenvraestelle in minute.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Luister Lab skep volledige oefenmateriaal — teks, natuurlike stem-opnames, gedrukte
              vraestelle en memoranda — sodat jy meer tyd kan spandeer aan onderrig, nie voorbereiding nie.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Skep gratis rekening</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/pricing">Bekyk pryse</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Geen kredietkaart nodig om te begin.</p>
          </div>
        </section>

        <section id="features" className="border-t border-border bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6">
            <Feature
              icon={<FileText className="h-5 w-5" />}
              title="Volledige vraestelle"
              body="Genereer Vraestel 2-styl take met teks, vrae en memoranda wat gereed is vir die klaskamer."
            />
            <Feature
              icon={<Mic2 className="h-5 w-5" />}
              title="Natuurlike stemme"
              body="Kies uit 'n reeks Afrikaanse stemme met beheer oor tempo en toon vir realistiese luister-oefening."
            />
            <Feature
              icon={<Sparkles className="h-5 w-5" />}
              title="Uitvoerbaar"
              body="Laai PDF's en MP3-klankgrepe af, of deel direk met leerders. Krediete rol een siklus oor."
            />
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-semibold">Hoe dit werk</h2>
          <ol className="mt-6 space-y-4 text-sm text-muted-foreground">
            {[
              "Kies 'n tema, moeilikheidsgraad en aantal vrae.",
              "Ons genereer die luister-teks, vrae en memorandum.",
              "Kies stemme en laai die klank en PDF's af.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
            <h2 className="font-display text-2xl font-semibold">Reg om te begin?</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Sien ons <Link to="/pricing" className="underline">pryse</Link> of skep dadelik 'n rekening.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button asChild size="lg"><Link to="/auth">Begin gratis</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/pricing">Bekyk pryse</Link></Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/80">
        <Check className="h-3.5 w-3.5" /> Ingesluit op elke plan
      </div>
    </div>
  );
}
