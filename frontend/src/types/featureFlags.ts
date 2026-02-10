// TODO generate this file from backend

import { z } from "zod";

export const featureFlagSchema = z.enum(["dedupeEnabled"]);
export type FeatureFlags = z.infer<typeof featureFlagSchema>;

const featureFlagMetadataSchema = z.object({
  name: featureFlagSchema,
  description: z.string(),
  count: z.number(),
});
export const featureFlagsMetadataSchema = z.array(featureFlagMetadataSchema);
export type FeatureFlagMetadata = z.infer<typeof featureFlagMetadataSchema>;
