import { z } from "zod";

export enum CollectionAccess {
  Private = "private",
  Public = "public",
  Unlisted = "unlisted",
}

export const collectionThumbnailSourceSchema = z.object({
  url: z.string().url(),
  urlPageId: z.string().url(),
  urlTs: z.string().datetime(),
  filename: z.string().optional(),
});

export type CollectionThumbnailSource = z.infer<
  typeof collectionThumbnailSourceSchema
>;

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
  thumbnailSource: collectionThumbnailSourceSchema.nullable(),
  defaultThumbnailName: z.string().nullable(),
  crawlCount: z.number(),
  uniquePageCount: z.number(),
  pageCount: z.number(),
  totalSize: z.number(),
  allowPublicDownload: z.boolean(),
  homeUrl: z.string().url().nullable(),
  homeUrlPageId: z.string().url().nullable(),
  homeUrlTs: z.string().datetime().nullable(),
  access: z.nativeEnum(CollectionAccess),
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

export const collectionUpdateSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    caption: z.string(),
    access: z.string(),
    defaultThumbnailName: z.string().nullable(),
    allowPublicDownload: z.boolean(),
    thumbnailSource: collectionThumbnailSourceSchema.nullable(),
  })
  .partial();

export type CollectionUpdate = z.infer<typeof collectionUpdateSchema>;
