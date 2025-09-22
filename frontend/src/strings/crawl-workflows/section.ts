import { msg } from "@lit/localize";

import { type SectionsEnum } from "@/utils/workflow";

const section: Record<SectionsEnum, string> = {
  scope: msg("Scope"),
  limits: msg("Crawl Limits"),
  behaviors: msg("Page Behavior"),
  browserSettings: msg("Browser Settings"),
  scheduling: msg("Scheduling"),
  collection: msg("Collection"),
  metadata: msg("Metadata"),
};

export default section;
