export const searchQueryKeys = ["name"];
export const searchOrgContextKey = Symbol("search-values");
export type SearchQuery = Record<(typeof searchQueryKeys)[number], string>;
export type SearchOrgKey = "collections";
