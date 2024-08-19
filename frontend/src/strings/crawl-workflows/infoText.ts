import { msg } from "@lit/localize";

import { type FormState } from "@/utils/workflow";

type Field = keyof FormState;

const infoText: Partial<Record<Field, string>> = {
  pageLimit: msg(
    "Adds a hard limit on the number of pages that will be crawled.",
  ),
  crawlTimeoutMinutes: msg(
    `Gracefully stop the crawler after a specified time limit.`,
  ),
  maxCrawlSizeGB: msg(
    `Gracefully stop the crawler after a specified size limit.`,
  ),
  pageLoadTimeoutSeconds: msg(
    `Limits amount of time to wait for a page to load. Behaviors will run after this timeout only if the page is partially or fully loaded.`,
  ),
  postLoadDelaySeconds: msg(
    `Waits on the page after initial HTML page load prior to moving on to next steps such as link extraction and behaviors. Can be useful with pages that are slow to load page contents.`,
  ),
  behaviorTimeoutSeconds: msg(
    `Limits how long behaviors can run on each page.`,
  ),
  pageExtraDelaySeconds: msg(
    `Waits on the page after behaviors are complete before moving onto the next page. Can be helpful for rate limiting.`,
  ),
};

export default infoText;
