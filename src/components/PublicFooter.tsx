import { Link } from "@tanstack/react-router";

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-border py-6 text-center text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-4 px-4">
        <Link to="/pricing" className="transition-colors hover:text-foreground">Pryse</Link>
        <Link to="/terms" className="transition-colors hover:text-foreground">Bepalings</Link>
        <Link to="/refunds" className="transition-colors hover:text-foreground">Terugbetalings</Link>
        <Link to="/privacy" className="transition-colors hover:text-foreground">Privaatheid</Link>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground/80">
        © {new Date().getFullYear()} Chirstopher Charkes Borchers · Bestellings word verwerk deur Paddle.com (Merchant of Record).
      </div>
    </footer>
  );
}
