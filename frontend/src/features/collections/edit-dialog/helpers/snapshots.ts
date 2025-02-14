import { type SnapshotItem } from "../../select-collection-page";

import { type CollectionThumbnailSource } from "@/types/collection";

export function sourceToSnapshot(
  source: CollectionThumbnailSource | null,
): SnapshotItem | null {
  if (source == null) return null;
  return {
    pageId: source.urlPageId,
    status: 200,
    ts: source.urlTs,
    url: source.url,
    filename: source.filename,
  };
}

export function snapshotToSource(
  source: SnapshotItem | null,
): CollectionThumbnailSource | null {
  if (source == null) return null;
  return {
    urlPageId: source.pageId,
    urlTs: source.ts,
    url: source.url,
    filename: source.filename,
  };
}
