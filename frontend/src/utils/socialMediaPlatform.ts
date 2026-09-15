import { socialMediaSites } from "@/constants/social-media-platforms";

const siteName = (site: string) => site.slice(0, site.indexOf("."));

export const socialMediaPlatformRegexFor = (site: string) =>
  new RegExp(`\\b${siteName(site)}\\b`, "i");

export const socialMediaPlatformRegex = new RegExp(
  `\\b(${socialMediaSites.map(siteName).join("|")})\\b`,
  "i",
);

export function isSocialMediaPlatform(url: string) {
  if (!url.length) return false;
  return socialMediaPlatformRegex.test(url);
}
