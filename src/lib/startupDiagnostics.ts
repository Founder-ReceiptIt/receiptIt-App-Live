export const STARTUP_VERSION = 3;
type StartupDiagnostic = {
  version: number; build: string; phase?: string; betaAuthorised?: boolean;
  authResolved?: boolean; protectedRoute?: string; introRequired?: boolean;
  destination?: string; worker?: string; failure?: string;
};
declare global { interface Window { __receiptItStartup?: StartupDiagnostic } }
// Explicit allow-list only: never account IDs, tokens, addresses or URL queries.
export function recordStartup(update: Partial<StartupDiagnostic>) {
  window.__receiptItStartup = { version: STARTUP_VERSION, build: 'pixel-startup-v3', ...window.__receiptItStartup, ...update };
}
