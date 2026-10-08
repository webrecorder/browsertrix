import { msg } from "@lit/localize";
import { html } from "lit";

import { type ArchivedItem } from "@/types/crawler";
import { isArchivingDisabled, type OrgData } from "@/utils/orgs";

export function runAnalysisButton({
  org,
  item,
  runCount,
  runCallback,
}: {
  org?: OrgData;
  item?: ArchivedItem;
  runCount?: number;
  runCallback: () => void;
}) {
  const fileCount = item?.filePageCount || 0;
  const errorCount = item?.errorPageCount || 0;
  const doneCount = item?.stats?.done ? parseInt(item.stats.done) : 0;
  const htmlCount = doneCount - fileCount - errorCount;
  const archivingDisabled = isArchivingDisabled(org, true);
  const noPagesToAnalyze = !htmlCount;
  let disabledReason = "";

  if (noPagesToAnalyze) {
    disabledReason = msg("There are no HTML pages to analyze.");
  }

  if (archivingDisabled) {
    disabledReason = msg("Archiving is currently disabled.");
  }

  return html`<btrix-popover
    content=${disabledReason}
    ?disabled=${!disabledReason}
  >
    <sl-button
      size="small"
      variant="${
        // This is checked again being 0 explicitly because while QA state is loading, `this.qaRuns` is undefined, and the content change is less when the rightmost button stays non-primary when a run exists.
        runCount === 0 ? "primary" : "default"
      }"
      @click=${runCallback}
      ?disabled=${!org || archivingDisabled || noPagesToAnalyze}
    >
      <sl-icon slot="prefix" name="microscope" library="app"></sl-icon>
      ${runCount ? msg("Rerun Analysis") : msg("Run Analysis")}
    </sl-button>
  </btrix-popover>`;
}
