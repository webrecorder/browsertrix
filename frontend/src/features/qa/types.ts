export type PageResponse = {
  id?: string;
  oid: string;
  crawl_id: string;
  url: string;
  title?: string;
  timestamp?: string; // Date
  load_state?: number; // TODO convert to enum
  status?: number; // TODO convert to enum
  screenshotMatch?: {};
  textMatch?: {};
  resourceCounts?: {};
  userid?: string;
  modified?: string;
  approved?: boolean;
  notes?: {
    id: string;
    text: string;
    created?: string;
    userid: string;
    userName: string;
  }[];
};
