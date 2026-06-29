import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "af" | "en";

type Dict = Record<string, string>;

const af: Dict = {
  "app.name": "Luister Lab",
  "app.tagline": "IGCSE Afrikaans 0548 Vraestelgenereerder",
  "nav.library": "Biblioteek",
  "nav.shop": "Winkel",
  "nav.voices": "Stemme",
  "nav.new": "Nuwe Vraestel",
  "nav.pricing": "Pryse",
  "nav.terms": "Bepalings",
  "nav.refunds": "Terugbetalings",
  "nav.privacy": "Privaatheid",
  "nav.signout": "Teken uit",
  "lang.toggle.aria": "Wissel taal",
  "credits.label": "krediete",
  "credits.buy": "Koop krediete",
  "auth.title": "Teken in by Luister Lab",
  "auth.subtitle": "Genereer Cambridge IGCSE Afrikaans Tweede Taal (0548) luistervraestelle.",
  "auth.email": "E-pos",
  "auth.password": "Wagwoord",
  "auth.signin": "Teken in",
  "auth.signup": "Registreer",
  "auth.google": "Gaan voort met Google",
  "auth.toggle.tosignup": "Geen rekening nie? Registreer",
  "auth.toggle.tosignin": "Het reeds 'n rekening? Teken in",
  "auth.error.title": "Aanmelding misluk",
  "dashboard.title": "Jou vraestelle",
  "dashboard.subtitle": "Cambridge IGCSE 0548/02 — Vraestel 2 Luister.",
  "dashboard.empty.title": "Nog geen vraestelle nie",
  "dashboard.empty.body": "Skep jou eerste oefenvraestel — al die afdelings, vrae en memorandum word outomaties gegenereer.",
  "dashboard.new": "Genereer nuwe vraestel",
  "dashboard.open": "Maak oop",
  "dashboard.status.draft": "Konsep",
  "dashboard.status.generating": "Genereer…",
  "dashboard.status.ready": "Gereed",
  "dashboard.status.failed": "Misluk",
  "new.title": "Nuwe luistervraestel",
  "new.subtitle": "Beskryf opsioneel 'n tema. Die stelsel genereer al 40 vrae oor die 5 oefeninge.",
  "new.titleLabel": "Vraestel titel",
  "new.titlePlaceholder": "Bv. Junie 2026 Oefenvraestel A",
  "new.themeLabel": "Tema-aanwysing (opsioneel)",
  "new.themePlaceholder": "Bv. omgewing en gemeenskap, of laat leeg vir gemengd",
  "new.cost": "Koste: 1 krediet",
  "new.generate": "Genereer vraestel",
  "new.generating": "Skep oefeninge…",
  "new.backLibrary": "Terug na biblioteek",
  "editor.backLibrary": "Terug",
  "editor.exercise": "Oefening",
  "editor.question": "Vraag",
  "editor.markScheme": "Memorandum",
  "editor.transcript": "Transkripsie",
  "editor.audio": "Klankbaan",
  "editor.exportPdf": "Laai PDF af",
  "editor.exportMs": "Laai memorandum af",
  "editor.exportTranscript": "Laai transkripsie af",
  "editor.generatingAudio": "Klank word geskep…",
  "editor.notReady": "Hierdie vraestel word nog geskep.",
  "shop.title": "Winkel",
  "shop.subtitle": "Gemeenskapsvraestele wat deur ander onderwysers gedeel word.",
  "shop.empty": "Nog geen items nie. Wees die eerste om 'n vraestel in te dien!",
  "pricing.title": "Pryse en krediete",
  "pricing.subtitle": "Een krediet skep een volledige luistervraestel met memo en transkripsie.",
  "common.cancel": "Kanselleer",
  "common.save": "Stoor",
  "common.delete": "Vee uit",
  "common.loading": "Laai…",
  "common.error": "Iets het verkeerd geloop",
  "common.retry": "Probeer weer",
  "footer.tagline": "Luister Lab · Nie geaffilieer met Cambridge Assessment International Education nie.",
};

const en: Dict = {
  "app.name": "Listening Lab",
  "app.tagline": "IGCSE Afrikaans 0548 Paper Generator",
  "nav.library": "Library",
  "nav.shop": "Shop",
  "nav.voices": "Voices",
  "nav.new": "New Paper",
  "nav.pricing": "Pricing",
  "nav.terms": "Terms",
  "nav.refunds": "Refunds",
  "nav.privacy": "Privacy",
  "nav.signout": "Sign out",
  "lang.toggle.aria": "Toggle language",
  "credits.label": "credits",
  "credits.buy": "Buy credits",
  "auth.title": "Sign in to Listening Lab",
  "auth.subtitle": "Generate Cambridge IGCSE Afrikaans as a Second Language (0548) listening papers.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signin": "Sign in",
  "auth.signup": "Create account",
  "auth.google": "Continue with Google",
  "auth.toggle.tosignup": "No account? Sign up",
  "auth.toggle.tosignin": "Have an account? Sign in",
  "auth.error.title": "Sign-in failed",
  "dashboard.title": "Your papers",
  "dashboard.subtitle": "Cambridge IGCSE 0548/02 — Paper 2 Listening.",
  "dashboard.empty.title": "No papers yet",
  "dashboard.empty.body": "Create your first practice paper — all exercises, questions and mark scheme are generated automatically.",
  "dashboard.new": "Generate new paper",
  "dashboard.open": "Open",
  "dashboard.status.draft": "Draft",
  "dashboard.status.generating": "Generating…",
  "dashboard.status.ready": "Ready",
  "dashboard.status.failed": "Failed",
  "new.title": "New listening paper",
  "new.subtitle": "Optionally describe a theme. The system generates all 40 questions across the 5 exercises.",
  "new.titleLabel": "Paper title",
  "new.titlePlaceholder": "e.g. June 2026 Practice Paper A",
  "new.themeLabel": "Theme hint (optional)",
  "new.themePlaceholder": "e.g. environment & community, or leave blank for mixed",
  "new.cost": "Cost: 1 credit",
  "new.generate": "Generate paper",
  "new.generating": "Creating exercises…",
  "new.backLibrary": "Back to library",
  "editor.backLibrary": "Back",
  "editor.exercise": "Exercise",
  "editor.question": "Question",
  "editor.markScheme": "Mark scheme",
  "editor.transcript": "Transcript",
  "editor.audio": "Audio track",
  "editor.exportPdf": "Download PDF",
  "editor.exportMs": "Download mark scheme",
  "editor.exportTranscript": "Download transcript",
  "editor.generatingAudio": "Generating audio…",
  "editor.notReady": "This paper is still being generated.",
  "shop.title": "Shop",
  "shop.subtitle": "Community papers shared by other teachers.",
  "shop.empty": "Nothing here yet — be the first to submit a paper!",
  "pricing.title": "Pricing & credits",
  "pricing.subtitle": "One credit creates one full listening paper with mark scheme and transcript.",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.retry": "Try again",
  "footer.tagline": "Listening Lab · Not affiliated with Cambridge Assessment International Education.",
};

const dictionaries: Record<Locale, Dict> = { af, en };

const STORAGE_KEY = "ll.locale";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<Ctx | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("af");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? (window.localStorage.getItem(STORAGE_KEY) as Locale | null) : null;
    if (stored === "af" || stored === "en") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
    if (typeof document !== "undefined") document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used inside <LanguageProvider>");
  return ctx;
}
