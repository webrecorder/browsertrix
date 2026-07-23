import type { Collection } from "@/types/collection";

export enum Tab {
  Replay = "replay",
  About = "about",
  Items = "items",
  Deduplication = "deduplication",
}

export type Dialog =
  | "delete"
  | "edit"
  | "removeItem"
  | "createIndex"
  | "purgeIndex"
  | "deleteIndex";

export type OpenDialogEventDetail = Dialog | "editItems";

export enum CollectionSearchParam {
  Editing = "editing",
}

export enum EditingSearchParamValue {
  Items = "items",
}

export type CollectionSavedEvent = CustomEvent<
  { id: string } & Partial<Collection>
>;
