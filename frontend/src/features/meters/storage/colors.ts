import { type Color } from "../utils/colors";

import { tw } from "@/utils/tailwind";

export type StorageType =
  | "default"
  | "crawls"
  | "uploads"
  | "archivedItems"
  | "browserProfiles"
  | "runningTime"
  | "misc";

export const storageColorClasses = {
  default: tw`text-neutral-600`,
  crawls: tw`text-lime-500`,
  uploads: tw`text-sky-500`,
  archivedItems: tw`text-primary-500`,
  browserProfiles: tw`text-orange-500`,
  runningTime: tw`text-blue-600`,
  misc: tw`text-gray-400`,
};

export const storageColors = {
  default: { primary: "neutral-600", border: "neutral-700" },
  crawls: { primary: "lime-500", border: "lime-700" },
  uploads: { primary: "sky-500", border: "sky-700" },
  archivedItems: { primary: "primary-500", border: "primary-700" },
  browserProfiles: { primary: "orange-500", border: "orange-700" },
  runningTime: { primary: "blue-600", border: "blue-700" },
  misc: { primary: "gray-400", border: "gray-600" },
} as const satisfies Record<StorageType, { primary: Color; border: Color }>;
