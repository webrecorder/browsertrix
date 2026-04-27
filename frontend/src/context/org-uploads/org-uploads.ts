import { createContext } from "@lit/context";

import { orgUploadsContextKey, type OrgUpload } from "./types";

export type OrgUploadsContext = OrgUpload[];

export const orgUploadsInitialValue = [] satisfies OrgUploadsContext;

export const orgUploadsContext =
  createContext<OrgUploadsContext>(orgUploadsContextKey);
