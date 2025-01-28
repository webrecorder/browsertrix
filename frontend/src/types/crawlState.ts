// Match backend TYPE_RUNNING_STATES in models.py
export const RUNNING_STATES = [
  "running",
  "pending-wait",
  "generate-wacz",
  "uploading-wacz",
  "paused",
] as const;

// Match backend TYPE_WAITING_STATES in models.py
export const WAITING_STATES = [
  "starting",
  "waiting_capacity",
  "waiting_org_limit",
] as const;

// Match backend TYPE_SUCCESSFUL_STATES in models.py
export const SUCCESSFUL_STATES = [
  "complete",
  "stopped_by_user",
  "stopped_storage_quota_reached",
  "stopped_time_quota_reached",
  "stopped_org_readonly",
] as const;

// Match backend TYPE_FAILED_STATES in models.py
export const FAILED_STATES = [
  "canceled",
  "failed",
  "skipped_storage_quota_reached",
  "skipped_time_quota_reached",
] as const;

export const RUNNING_AND_WAITING_STATES = [
  ...RUNNING_STATES,
  ...WAITING_STATES,
] as const;

export const SUCCESSFUL_AND_FAILED_STATES = [
  ...SUCCESSFUL_STATES,
  ...FAILED_STATES,
] as const;

const CRAWL_STATES = [
  ...RUNNING_AND_WAITING_STATES,
  ...SUCCESSFUL_AND_FAILED_STATES,
] as const;

export type CrawlState = (typeof CRAWL_STATES)[number];
