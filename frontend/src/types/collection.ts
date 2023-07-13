export type Collection = {
  id: string;
  oid: string;
  name: string;
  description: string | null;
  modified: string; // date
  crawlCount: number;
  pageCount: number;
  tags: string[];
  resources: string[];
  publishedUrl?: string;
  publishing?: boolean;
  pPercent?: number;
};

export type CollectionList = Collection[];

export type CollectionSearchValues = {
  names: string[];
}
