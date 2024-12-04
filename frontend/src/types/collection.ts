import { z } from "zod";

export enum CollectionAccess {
  Private = "private",
  Public = "public",
  Unlisted = "unlisted",
}

export const publicCollectionSchema = z.object({
  oid: z.string(),
  name: z.string(),
  caption: z.string().nullable(),
  description: z.string().nullable(),
  resources: z.array(z.string()),
  dateEarliest: z.string().datetime().nullable(),
  dateLatest: z.string().datetime().nullable(),
  homeUrl: z.string().url().nullable(),
  homeUrlTs: z.string().datetime().nullable(),
  thumbnail: z.unknown().nullable(),
  crawlCount: z.number(),
  pageCount: z.number(),
  totalSize: z.number(),
});
export type PublicCollection = z.infer<typeof publicCollectionSchema>;

export const collectionSchema = publicCollectionSchema.extend({
  id: z.string(),
  modified: z.string().datetime(),
  tags: z.array(z.string()),
  access: z.nativeEnum(CollectionAccess),
});
export type Collection = z.infer<typeof collectionSchema>;

export type CollectionSearchValues = {
  names: string[];
};
