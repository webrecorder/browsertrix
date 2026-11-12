import { type Metrics } from "@/types/org";

export function miscStorage(metrics: Metrics) {
  return (
    metrics.storageUsedSeedFiles +
    metrics.storageUsedThumbnails +
    metrics.storageUsedDedupeIndexes
  );
}
