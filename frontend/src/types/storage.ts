import { z } from "zod";

export const storageFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().url(),
  hash: z.string(),
  size: z.number(),
  originalFilename: z.string(),
  mime: z.string(),
  created: z.string(),
});

export type StorageFile = z.infer<typeof storageFileSchema>;
