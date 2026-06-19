import { z } from "zod";

const timestampSchema = z.string(); // TODO timestamp
const statusSchema = z.number().int(); // TODO HTTP status codes

export const pageSnapshotSchema = z.object({
  id: z.string(),
  oid: z.string(),
  crawl_id: z.string(),
  url: z.string(),
  title: z.string(),
  ts: timestampSchema,
  loadState: z.number().int(),
  status: statusSchema,
  mime: z.string(),
  filename: z.string(),
  depth: z.number().int(),
  favIconUrl: z.string(),
  isSeed: z.boolean(),
  userid: z.string(),
  modified: z.string(),
  approved: z.boolean(),
  notes: z.array(z.string()),
  isFile: z.boolean(),
  isError: z.boolean(),
});
export type PageSnapshot = z.infer<typeof pageSnapshotSchema>;

export type PageSnapshotSortFields = Pick<PageSnapshot, "url" | "title" | "ts">;

export const pageUrlCountsSchema = z.object({
  url: z.string(),
  count: z.number().int(),
  snapshots: z.array(
    z.object({
      pageId: z.string(),
      ts: timestampSchema,
      status: statusSchema,
    }),
  ),
});
export type PageUrlCount = z.infer<typeof pageUrlCountsSchema>;
