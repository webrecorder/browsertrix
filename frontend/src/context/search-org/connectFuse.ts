/**
 * Enable fuzzy search on available values.
 */
import Fuse from "fuse.js";

import { searchQueryKeys, type SearchQuery } from "./types";

export const defaultFuseOptions: Fuse.IFuseOptions<unknown> = {
  threshold: 0.3, // stricter; default is 0.6
  useExtendedSearch: true,
  includeMatches: true,
  includeScore: true,
  shouldSort: false,
};

export function connectFuse(values: SearchQuery[]) {
  return new Fuse(values, {
    ...defaultFuseOptions,
    keys: searchQueryKeys,
  });
}
