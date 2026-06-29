import { Headphones, LayoutGrid, LogOut, Mic2, Plus, Store } from "lucide-react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CreditBalance } from "@/components/CreditBalance";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children?: ReactNode;
  requireAuth?: boolean;
};

export function AppShell({ children, requireAuth = true }: AppShellProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useT();

  useEffect(() => {
    if (requireAuth && !loading && !user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [requireAuth, loading, user, navigate]);

  if (requireAuth && (loading || !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  const navItem = (to: string, label: string, Icon: typeof LayoutGrid, exact = false) => {
    const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
          active ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Headphones className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold">{t("app.name")}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t("app.tagline")}</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            {navItem("/dashboard", t("nav.library"), LayoutGrid, true)}
            {navItem("/voices", t("nav.voices"), Mic2)}
            {navItem("/shop", t("nav.shop"), Store)}
            {navItem("/assessments/new", t("nav.new"), Plus)}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            {user ? (
              <>
                <CreditBalance />
                <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground md:inline">{user.email}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("nav.signout")}
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/auth", replace: true });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1">{children ?? <Outlet />}</main>

      <footer className="space-y-2 border-t border-border py-6 text-center text-xs text-muted-foreground">
        <div>{t("footer.tagline")}</div>
        <div className="flex items-center justify-center gap-4">
          <Link to="/pricing" className="transition-colors hover:text-foreground">{t("nav.pricing")}</Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">{t("nav.terms")}</Link>
          <Link to="/refunds" className="transition-colors hover:text-foreground">{t("nav.refunds")}</Link>
          <Link to="/privacy" className="transition-colors hover:text-foreground">{t("nav.privacy")}</Link>
        </div>
      </footer>
    </div>
  );
}
