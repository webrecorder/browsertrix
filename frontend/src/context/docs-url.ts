import { createContext } from "@lit/context";

export type DocsUrlContext = string | undefined;

export const docsUrlContext = createContext<DocsUrlContext>("docsUrl");
