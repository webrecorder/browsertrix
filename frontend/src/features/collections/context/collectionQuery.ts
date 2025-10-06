import { createContext } from "@lit/context";
import type Fuse from "fuse.js";

export type CollectionQueryContext =
  | (Fuse<{ name: string }> & {
      records: Fuse.FuseIndexRecords;
    })
  | null;

export const collectionQueryContext =
  createContext<CollectionQueryContext>("collectionQuery");
