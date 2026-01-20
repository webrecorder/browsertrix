export enum Tab {
  Replay = "replay",
  About = "about",
  Items = "items",
  Deduplication = "deduplication",
}

export type Dialog =
  | "delete"
  | "edit"
  | "replaySettings"
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
