import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { locale, setLocale, t } = useT();
  return (
    <div
      role="group"
      aria-label={t("lang.toggle.aria")}
      className="inline-flex items-center rounded-md border border-border bg-card text-xs font-medium"
    >
      {(["af", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={cn(
            "px-2.5 py-1 uppercase tracking-wider transition-colors",
            locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={locale === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
