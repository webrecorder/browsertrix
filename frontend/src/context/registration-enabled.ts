import { createContext } from "@lit/context";

export type RegistrationEnabledContext = boolean | undefined;

export const registrationEnabledContext =
  createContext<RegistrationEnabledContext>("registrationEnabled");
