import type { BtrixChangeEvent } from "@/events/btrix-change";

export type TagType =
  | "workflow"
  | "workflow-crawl"
  | "archived-item"
  | "archived-item-crawl"
  | "upload"
  | "profile";

export type TagCount = {
  tag: string;
  count: number;
};

export type TagCounts = {
  tags: TagCount[];
};

export type ChangeTagEventDetails =
  | { tags: string[]; type: "and" | "or" }
  | undefined;

export type BtrixChangeTagFilterEvent = BtrixChangeEvent<ChangeTagEventDetails>;
