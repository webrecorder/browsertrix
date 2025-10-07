/**
 * Store org-wide searchable data, like collection names.
 */
import { createContext } from "@lit/context";
import type Fuse from "fuse.js";

import {
  searchOrgContextKey,
  type SearchOrgKey,
  type SearchQuery,
} from "./types";

export type SearchOrgContext = Record<SearchOrgKey, Fuse<SearchQuery> | null>;

export const searchOrgInitialValue = {
  collections: null,
} as const satisfies SearchOrgContext;

export const searchOrgContext =
  createContext<SearchOrgContext>(searchOrgContextKey);
