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

export enum CommonTab {
  New = "new",
  View = "view",
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
    `(/${OrgTab.Workflows}(/${WorkflowTab.Crawls})(/${CommonTab.New})(/:workflowId(/:workflowTab)(/${WorkflowTab.Crawls}${archivedItemPath})))`,
    `(/${OrgTab.Items}(/:itemType(${archivedItemPath})))`,
    `(/${OrgTab.Collections}(/${CommonTab.New})(/${CommonTab.View}/:collectionId(/:collectionTab)))`,
    `(/${OrgTab.BrowserProfiles}(/profile(/:profileId)(/browser/:browserId)))`,
    `(/${OrgTab.Settings}(/:settingsTab))`,
  ].join(""),
  publicOrgs: `/${RouteNamespace.PublicOrgs}(/)`,
  publicOrg: `/${RouteNamespace.PublicOrgs}/:slug(/)`,
  publicCollection: `/${RouteNamespace.PublicOrgs}/:slug/collections/:collectionSlug(/:collectionTab)`,
  // Superadmin routes
  admin: `/${RouteNamespace.Superadmin}(/)`,
  adminOrgs: `/${RouteNamespace.Superadmin}/orgs(/)`,
  adminFeatureFlags: `/${RouteNamespace.Superadmin}/feature-flags(/)`,
  adminUsers: `/${RouteNamespace.Superadmin}/users(/)`,
  adminUsersInvite: `/${RouteNamespace.Superadmin}/users/invite`,
  adminCrawls: `/${RouteNamespace.Superadmin}/crawls(/)`,
  adminCrawl: `/${RouteNamespace.Superadmin}/crawls/crawl/:crawlId`,
  // Redirect for https://github.com/webrecorder/browsertrix-cloud/issues/935
  awpUploadRedirect: `/${RouteNamespace.PrivateOrgs}/:orgId/artifacts/upload/:uploadId`,
} as const;

export type Routes = typeof ROUTES;
