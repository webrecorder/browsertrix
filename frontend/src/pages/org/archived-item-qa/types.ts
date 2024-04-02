export const TABS = ["screenshots", "text", "resources", "replay"] as const;
export type QATab = (typeof TABS)[number];

export type GoodBad = {
  good: number;
  bad: number;
};

export type BlobPayload = { blobUrl: string };
export type TextPayload = { text: string };
export type ReplayPayload = { replayUrl: string };
export type ResourcesPayload = { resources: string };
export type ReplayData = BlobPayload &
  TextPayload &
  ReplayPayload &
  ResourcesPayload;
