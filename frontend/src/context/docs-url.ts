import { createContext } from "@lit/context";

export type DocsUrlContext = string | null;

export const docsUrlContext = createContext<DocsUrlContext>("docsUrl");
