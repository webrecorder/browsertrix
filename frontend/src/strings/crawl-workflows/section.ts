import { msg } from "@lit/localize";

import { type SectionsEnum } from "@/utils/workflow";

const section: Record<SectionsEnum, string> = {
  scope: msg("Scope"),
  perCrawlLimits: msg("Per-Crawl Limits"),
  perPageLimits: msg("Per-Page Limits"),
  browserSettings: msg("Browser Settings"),
  scheduling: msg("Scheduling"),
};

export default section;
