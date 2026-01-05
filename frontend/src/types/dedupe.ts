import { z } from "zod";

// Match backend TYPE_DEDUPE_INDEX_STATES in models.py
export const DEDUPE_INDEX_STATES = [
  "initing",
  "importing",
  "ready",
  "purging",
  "idle",
  "saving",
  "crawling",
] as const;

export type DedupeIndexState = (typeof DEDUPE_INDEX_STATES)[number];

export const dedupeIndexStatsSchema = z.object({
  uniqueUrls: z.number(),
  totalUrls: z.number(),
  sizeSaved: z.number(),
  totalSize: z.number(),
  removableCrawls: z.number(),
  totalCrawls: z.number(),
});
export type DedupeIndexStats = z.infer<typeof dedupeIndexStatsSchema>;
