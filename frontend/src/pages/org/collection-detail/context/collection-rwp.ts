/**
 * Make collection ReplayWeb.Page iframe available to fetch objects like screenshots.
 */

import { createContext } from "@lit/context";
import type { ReplayWebPage } from "replaywebpage";

export type CollectionRwpContext = ReplayWebPage | null | undefined;

export const collectionRwpContext =
  createContext<CollectionRwpContext>("collection-rwp");
