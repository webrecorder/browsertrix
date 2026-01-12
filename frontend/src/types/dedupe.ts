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
  totalUrls: z.number(),
  dupeUrls: z.number(),
  conservedSize: z.number(),
  totalCrawls: z.number(),
  totalCrawlSize: z.number(),
  removedCrawls: z.number(),
  removedCrawlSize: z.number(),
});
export type DedupeIndexStats = z.infer<typeof dedupeIndexStatsSchema>;
