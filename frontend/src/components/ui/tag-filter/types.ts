import type { BtrixChangeEvent } from "@/events/btrix-change";

export type TagType = "workflow" | "crawl" | "upload" | "profile";

export type Tag = {
  tag: string;
  count: number;
};

export type Tags = {
  tags: Tag[];
};

export type ChangeTagEventDetails =
  | { tags: string[]; type: "and" | "or" }
  | undefined;

export type BtrixChangeTagFilterEvent = BtrixChangeEvent<ChangeTagEventDetails>;
