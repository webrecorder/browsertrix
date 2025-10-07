/**
 * Enable fuzzy search on available values.
 */
import Fuse from "fuse.js";

import { searchQueryKeys, type SearchQuery } from "./types";

export function connectFuse(values: SearchQuery[]) {
  return new Fuse(values, {
    keys: searchQueryKeys,
    threshold: 0.3,
    useExtendedSearch: true,
    includeMatches: true,
  });
}
