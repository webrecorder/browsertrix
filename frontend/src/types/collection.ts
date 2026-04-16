import { z } from "zod";

import { DEDUPE_INDEX_STATES, dedupeIndexStatsSchema } from "./dedupe";
import { storageFileSchema } from "./storage";

export const COLLECTION_NAME_MAX_LENGTH = 50;
export const COLLECTION_CAPTION_MAX_LENGTH = 150;

export enum CollectionAccess {
  Private = "private",
  Public = "public",
  Unlisted = "unlisted",
}

export const collectionThumbnailSourceSchema = z.object({
  url: z.string().url(),
  urlPageId: z.string().uuid(),
  urlTs: z.string().datetime(),
});

export type CollectionThumbnailSource = z.infer<
  typeof collectionThumbnailSourceSchema
>;

export const publicCollectionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  oid: z.string(),
  orgName: z.string(),
  orgPublicProfile: z.boolean(),
  name: z.string(),
  created: z.string().datetime().nullable(), // NOTE dates may be null for older collections since we can't backfill
  modified: z.string().datetime().nullable(),
  caption: z.string().nullable(),
  description: z.string().nullable(),
  resources: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      hash: z.string(),
      size: z.number(),
      crawlId: z.string().nullable(),
      numReplicas: z.number(),
      expireAt: z.string().datetime().nullable(),
      fromDependency: z.boolean(),
    }),
  ),
  dateEarliest: z.string().datetime().nullable(),
  dateLatest: z.string().datetime().nullable(),
  thumbnail: storageFileSchema.nullable(),
  thumbnailSource: collectionThumbnailSourceSchema.nullable(),
  defaultThumbnailName: z.string().nullable(),
  crawlCount: z.number(),
  uniquePageCount: z.number(),
  pageCount: z.number(),
  topPageHosts: z.array(
    z.object({
      host: z.string(),
      count: z.number(),
    }),
  ),
  totalSize: z.number(),
  allowPublicDownload: z.boolean(),
  homeUrl: z.string().url().nullable(),
  homeUrlPageId: z.string().nullable(),
  homeUrlTs: z.string().datetime().nullable(),
  access: z.nativeEnum(CollectionAccess),
});
export type PublicCollection = z.infer<typeof publicCollectionSchema>;

export const collectionSchema = publicCollectionSchema.extend({
  orgName: z.string().optional(),
  orgPublicProfile: z.boolean().optional(),
  tags: z.array(z.string()),
  access: z.nativeEnum(CollectionAccess),
  indexLastSavedAt: z.string().datetime().nullable(),
  indexState: z.enum(DEDUPE_INDEX_STATES).nullable(),
  indexStats: dedupeIndexStatsSchema.optional().nullable(),
  /**
   * The number of running updates for this collection.
   * Updates may affect:
   * - {@linkcode collectionSchema._type.crawlCount | crawlCount}
   * - {@linkcode collectionSchema._type.pageCount | pageCount}
   * - {@linkcode collectionSchema._type.uniquePageCount | uniquePageCount}
   * - {@linkcode collectionSchema._type.totalSize | totalSize}
   * - {@linkcode collectionSchema._type.tags | tags}
   * - {@linkcode collectionSchema._type.topPageHosts | topPageHosts}
   * - {@linkcode collectionSchema._type.dateEarliest | dateEarliest}
   * - {@linkcode collectionSchema._type.dateLatest | dateLatest}
   */
  runningUpdatesCount: z.number(),
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
