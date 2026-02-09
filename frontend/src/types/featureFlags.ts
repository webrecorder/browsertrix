// TODO generate this file from backend

import { z } from "zod";

export const featureFlagSchema = z.enum(["dedupeEnabled"]);
export type FeatureFlags = z.infer<typeof featureFlagSchema>;
