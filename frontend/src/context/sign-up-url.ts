import { createContext } from "@lit/context";

export type SignUpUrlContext = string | undefined;

export const signUpUrlContext = createContext<SignUpUrlContext>("signUpUrl");
