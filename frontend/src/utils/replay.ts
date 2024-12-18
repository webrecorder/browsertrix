/**
 * Format timestamp returned from API into string format
 * accepted by `<replay-web-page>` `ts`.
 */
export function formatRwpTimestamp(ts?: string | null): string | undefined {
  if (!ts) return;
  return ts.split(".")[0].replace(/\D/g, "");
}
