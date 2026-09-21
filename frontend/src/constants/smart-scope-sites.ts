import type { ArrayElement } from "type-fest/source/internal";

/**
 * List of sites supported by smart scoping, based on https://github.com/webrecorder/browsertrix-behaviors.
 */
export const SmartScopeSites = ["instagram.com", "facebook.com", "youtube.com", "youtu.be", "youtube-nocookie.com"] as const;

export type SmartScopeSite = ArrayElement<typeof SmartScopeSites>;
