import { AccessCode, UserRole } from "../types/org";
export * from "../types/org";

export function isOwner(accessCode?: (typeof AccessCode)[UserRole]): boolean {
  if (!accessCode) return false;

  return accessCode === AccessCode.owner;
}

export function isAdmin(accessCode?: (typeof AccessCode)[UserRole]): boolean {
  if (!accessCode) return false;

  return accessCode >= AccessCode.owner;
}

export function isCrawler(accessCode?: (typeof AccessCode)[UserRole]): boolean {
  if (!accessCode) return false;

  return accessCode >= AccessCode.crawler;
}

export function getOrgBasePath() {
  const path = window.location.pathname.split("/orgs/")[1];
  if (!path) return "/";
  const slug = path.slice(0, path.indexOf("/"));
  return `/orgs/${slug}`;
}
