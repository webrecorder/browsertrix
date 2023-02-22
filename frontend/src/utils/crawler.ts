import { msg, str } from "@lit/localize";
import type { CrawlConfig } from "../types/crawler";

export function getNameFromSeedURLs({ jobType, config }: CrawlConfig): string {
  const firstSeed = config.seeds[0];
  let firstSeedURL = typeof firstSeed === "string" ? firstSeed : firstSeed.url;
  if (config.seeds.length === 1) {
    return firstSeedURL;
  }
  const remainderCount = config.seeds.length - 1;
  if (remainderCount === 1) {
    return msg(str`${firstSeed} (+${remainderCount} URL)`);
  }
  return msg(str`${firstSeed} (+${remainderCount} URLs)`);
}
