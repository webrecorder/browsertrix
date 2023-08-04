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
  isPublic: boolean;
};

export type CollectionList = Collection[];

export type CollectionSearchValues = {
  names: string[];
};
