import type { Profile } from "@/types/crawler";

export type ProfileUpdatedEvent = CustomEvent<
  Partial<Pick<Profile, "name" | "description">>
>;

export type CreateBrowserOptions = {
  url: string;
  profileId?: string;
  crawlerChannel?: string;
  proxyId?: string;
};
