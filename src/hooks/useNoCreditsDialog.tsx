import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Coins } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Ctx = {
  showNoCreditsDialog: () => void;
};

const NoCreditsDialogContext = createContext<Ctx | undefined>(undefined);

export function NoCreditsDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const showNoCreditsDialog = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ showNoCreditsDialog }), [showNoCreditsDialog]);

  return (
    <NoCreditsDialogContext.Provider value={value}>
      {children}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 sm:mx-0">
              <Coins className="h-7 w-7 text-accent" />
            </div>
            <AlertDialogTitle className="text-center text-xl sm:text-left">
              {t("Jou krediete is op", "You're out of credits")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base sm:text-left">
              {t(
                "Jy het nie genoeg krediete oor om dit te doen nie. Koop meer krediete om voort te gaan.",
                "You don't have enough credits left to do that. Buy more credits to keep going.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button asChild onClick={() => setOpen(false)}>
              <Link to="/pricing">{t("credits.buy")}</Link>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NoCreditsDialogContext.Provider>
  );
}

export function useNoCreditsDialog() {
  const ctx = useContext(NoCreditsDialogContext);
  if (!ctx) throw new Error("useNoCreditsDialog must be used inside <NoCreditsDialogProvider>");
  return ctx;
}
