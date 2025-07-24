export type { Page } from "@/features/qa/page-list/helpers/page";

export const TABS = ["screenshots", "text", "resources", "replay"] as const;
export type QATab = (typeof TABS)[number];

export type GoodBad = {
  good: number;
  bad: number;
};

export type BlobPayload = { blobUrl: string };
export type TextPayload = { text: string };
export type ReplayPayload = { replayUrl: string };
export type ResourcesPayload = { resources: { [key: string]: GoodBad } };
export type ReplayData = Partial<
  BlobPayload & TextPayload & ReplayPayload & ResourcesPayload
> | null;
