/**
 * Format timestamp returned from API into string format
 * accepted by `<replay-web-page>` `ts`.
 */
export function formatRwpTimestamp(ts?: string | null): string | undefined {
  if (!ts) return;
  return ts.split(".")[0].replace(/\D/g, "");
}

export async function formatRwpWaczHash(filename?: string) {
  if (!filename) {
    return "";
  }

  return await digestMessage(filename, "sha-256");
}

// the below match the implementation in wabac.js
export function base16(hashBuffer: ArrayBuffer) {
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function digestMessage(
  message: string | Uint8Array,
  hashtype: string,
) {
  const msgUint8 =
    typeof message === "string" ? new TextEncoder().encode(message) : message;
  const hashBuffer = await crypto.subtle.digest(hashtype, msgUint8);
  return base16(hashBuffer);
}
