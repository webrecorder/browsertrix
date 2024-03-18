import type { ArchivedItemPage } from "@/types/crawler";

export type SortBy = "screenshotMatch" | "textMatch"; // TODO add resource counts, timestamps, etc

export const pageIsReviewed = (page: ArchivedItemPage) =>
  page.approved != null || !!page.notes?.length;

export * from "./crawlCounts";
export * from "./groupBy";
export * from "./iconFor";
export * from "./issueCounts";
export * from "./severity";
export type * from "./severity";
