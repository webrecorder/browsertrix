/**
 * Popular social media platforms
 */
export enum SocialMediaPlatform {
  BLUESKY = "bsky",
  FACEBOOK = "facebook",
  INSTAGRAM = "instagram",
  LINKEDIN = "linkedin",
  REDDIT = "reddit",
  TELEGRAM = "telegram",
  THREADS = "threads",
  TIKTOK = "tiktok",
  TWITTER = "twitter",
  SNAPCHAT = "snapchat",
  VIMEO = "vimeo",
  WHATSAPP = "whatsapp",
  X = "x",
  YOUTUBE = "youtube",
}

export const socialMediaSitesForPlatform: Record<
  SocialMediaPlatform,
  string[]
> = {
  [SocialMediaPlatform.BLUESKY]: ["bsky.app", "bsky.social"],
  [SocialMediaPlatform.FACEBOOK]: ["facebook.com"],
  [SocialMediaPlatform.INSTAGRAM]: ["instagram.com"],
  [SocialMediaPlatform.LINKEDIN]: ["linkedin.com"],
  [SocialMediaPlatform.REDDIT]: ["reddit.com"],
  [SocialMediaPlatform.TELEGRAM]: ["telegram.com"],
  [SocialMediaPlatform.THREADS]: ["threads.com"],
  [SocialMediaPlatform.TIKTOK]: ["tiktok.com"],
  [SocialMediaPlatform.TWITTER]: ["twitter.com"],
  [SocialMediaPlatform.SNAPCHAT]: ["snapchat.com"],
  [SocialMediaPlatform.VIMEO]: ["vimeo.com"],
  [SocialMediaPlatform.WHATSAPP]: ["whatsapp.com"],
  [SocialMediaPlatform.X]: ["x.com"],
  [SocialMediaPlatform.YOUTUBE]: ["youtube.com", "youtu.be"],
} as const;

export const socialMediaSites = [
  ...Object.values(socialMediaSitesForPlatform).reduce(
    (prev, curr) => [...prev, ...curr],
    [],
  ),
] as const;
