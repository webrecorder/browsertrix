import type { DedupeIndexState } from "@/types/dedupe";

export function indexAvailable(state?: DedupeIndexState | null) {
  if (!state) return null;
  return state === "ready" || state === "idle";
}

export function indexInUse(state?: DedupeIndexState | null) {
  if (!state) return null;
  return state === "crawling" || state === "saving";
}

export function indexUpdating(state?: DedupeIndexState | null) {
  if (!state) return null;
  return state === "importing" || state === "purging";
}
