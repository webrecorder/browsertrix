export enum CollectionAccess {
  Private = "private",
  Public = "public",
  Unlisted = "unlisted",
}

export type Collection = {
  id: string;
  oid: string;
  name: string;
  description: string | null;
  modified: string; // date
  crawlCount: number;
  pageCount: number;
  totalSize: number;
  tags: string[];
  resources: string[];
  access: CollectionAccess;
};

export type CollectionSearchValues = {
  names: string[];
};
