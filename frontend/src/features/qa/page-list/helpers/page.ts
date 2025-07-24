import type { ArchivedItemPage } from "@/types/crawler";
import type { ArchivedItemQAPage } from "@/types/qa";

export type Page = ArchivedItemPage | ArchivedItemQAPage;

export const isQaPage = (page: Page): page is ArchivedItemQAPage => {
  if ("qa" in page) return !!page.qa;
  return false;
};
