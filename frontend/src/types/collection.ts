import { z } from "zod";

export enum CollectionAccess {
  Private = "private",
  Public = "public",
  Unlisted = "unlisted",
}

export const publicCollectionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  oid: z.string(),
  name: z.string(),
  created: z.string().datetime(),
  modified: z.string().datetime(),
  caption: z.string().nullable(),
  description: z.string().nullable(),
  resources: z.array(z.string()),
  dateEarliest: z.string().datetime().nullable(),
  dateLatest: z.string().datetime().nullable(),
  thumbnail: z
    .object({
      name: z.string(),
      path: z.string().url(),
    })
    .nullable(),
  defaultThumbnailName: z.string().nullable(),
  crawlCount: z.number(),
  pageCount: z.number(),
  snapshotCount: z.number(),
  totalSize: z.number(),
  allowPublicDownload: z.boolean(),
  homeUrl: z.string().url().nullable(),
  homeUrlPageId: z.string().url().nullable(),
  homeUrlTs: z.string().datetime().nullable(),
});
export type PublicCollection = z.infer<typeof publicCollectionSchema>;

export const collectionSchema = publicCollectionSchema.extend({
  tags: z.array(z.string()),
  access: z.nativeEnum(CollectionAccess),
});
export type Collection = z.infer<typeof collectionSchema>;

export type CollectionSearchValues = {
  names: string[];
};
