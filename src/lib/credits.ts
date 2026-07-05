// Client-safe credit helpers (contrast with credits.server.ts, which wraps
// the SECURITY DEFINER RPCs and must only be imported from server handlers).

export function isInsufficientCreditsError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes("insufficient");
}
