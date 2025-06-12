export enum OrgTab {
  Dashboard = "dashboard",
  Workflows = "workflows",
  Items = "items",
  Collections = "collections",
  BrowserProfiles = "browser-profiles",
  Settings = "settings",
}

export enum RouteNamespace {
  PrivateOrgs = "orgs",
  PublicOrgs = "explore",
  Superadmin = "admin",
}

export enum WorkflowTab {
  LatestCrawl = "latest",
  Crawls = "crawls",
  Logs = "logs",
  Settings = "settings",
}

const archivedItemPath = "/:itemId(/review/:qaTab)";

export const ROUTES = {
  home: "/",
  join: "/join/:token",
  signUp: "/sign-up",
  acceptInvite: "/invite/accept/:token",
  verify: "/verify",
  login: "/log-in",
  loginWithRedirect: "/log-in?redirectUrl",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password",
  accountSettings: "/account/settings(/:settingsTab)",
  orgs: `/${RouteNamespace.PrivateOrgs}(/)`,
  org: [
    `/${RouteNamespace.PrivateOrgs}/:slug(/)`,
    // Org sections:
    `(/${OrgTab.Dashboard})`,
    `(/${OrgTab.Workflows}(/new)(/:workflowId(/:workflowTab)(/crawls${archivedItemPath})))`,
    `(/${OrgTab.Items}(/:itemType(${archivedItemPath})))`,
    `(/${OrgTab.Collections}(/new)(/view/:collectionId(/:collectionTab)))`,
    `(/${OrgTab.BrowserProfiles}(/profile(/browser/:browserId)(/:browserProfileId)))`,
    `(/${OrgTab.Settings}(/:settingsTab))`,
  ].join(""),
  publicOrgs: `/${RouteNamespace.PublicOrgs}(/)`,
  publicOrg: `/${RouteNamespace.PublicOrgs}/:slug(/)`,
  publicCollection: `/${RouteNamespace.PublicOrgs}/:slug/collections/:collectionSlug(/:collectionTab)`,
  // Superadmin routes
  admin: `/${RouteNamespace.Superadmin}(/)`,
  adminUsers: `/${RouteNamespace.Superadmin}/users(/)`,
  adminUsersInvite: `/${RouteNamespace.Superadmin}/users/invite`,
  adminCrawls: `/${RouteNamespace.Superadmin}/crawls(/)`,
  adminCrawl: `/${RouteNamespace.Superadmin}/crawls/crawl/:crawlId`,
  // Redirect for https://github.com/webrecorder/browsertrix-cloud/issues/935
  awpUploadRedirect: `/${RouteNamespace.PrivateOrgs}/:orgId/artifacts/upload/:uploadId`,
} as const;

export type Routes = typeof ROUTES;
