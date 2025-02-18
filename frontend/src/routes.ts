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

export const ROUTES = {
  admin: `/${RouteNamespace.Superadmin}`,
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
    `(/${OrgTab.Workflows}(/new)(/:workflowId(/crawls/:itemId(/review/:qaTab))))`,
    `(/${OrgTab.Items}(/:itemType(/:itemId(/review/:qaTab))))`,
    `(/${OrgTab.Collections}(/new)(/view/:collectionId(/:collectionTab)))`,
    `(/${OrgTab.BrowserProfiles}(/profile(/browser/:browserId)(/:browserProfileId)))`,
    `(/${OrgTab.Settings}(/:settingsTab))`,
  ].join(""),
  publicOrgs: `/${RouteNamespace.PublicOrgs}(/)`,
  publicOrg: `/${RouteNamespace.PublicOrgs}/:slug(/)`,
  publicCollection: `/${RouteNamespace.PublicOrgs}/:slug/collections/:collectionSlug(/:collectionTab)`,
  users: `/${RouteNamespace.Superadmin}/users`,
  usersInvite: `/${RouteNamespace.Superadmin}/users/invite`,
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
  // Redirect for https://github.com/webrecorder/browsertrix-cloud/issues/935
  awpUploadRedirect: `/${RouteNamespace.PrivateOrgs}/:orgId/artifacts/upload/:uploadId`,
} as const;

export type Routes = typeof ROUTES;
