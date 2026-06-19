import type { CollectionRwpContext } from "../context/collection-rwp";

import { formatRwpTimestamp } from "@/utils/replay";

/**
 * Query thumbnail from `<replay-web-page>` embed
 */
export const getThumbnailBlob = async (
  {
    collectionId,
    rwp,
    url,
    timestamp,
  }: {
    collectionId?: string;
    rwp?: CollectionRwpContext;
    url: string;
    timestamp: string;
  },
  signal: AbortSignal,
) => {
  if (!rwp) {
    console.debug("no rwp");
    return;
  }
  const resp = await rwp.shadowRoot
    ?.querySelector("iframe")
    ?.contentWindow?.fetch(
      `/replay/w/${collectionId}/${formatRwpTimestamp(timestamp)}id_/urn:thumbnail:${url}`,
      { signal },
    );

  if (resp?.status === 200) {
    return await resp.blob();
  }
};
