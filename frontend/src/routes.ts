export enum OrgTab {
  ProfilePreview = "profile-preview",
  Dashboard = "dashboard",
  Workflows = "workflows",
  Items = "items",
  Collections = "collections",
  BrowserProfiles = "browser-profiles",
  Settings = "settings",
}

export const ROUTES = {
  home: "/",
  dashboard: "/dashboard",
  join: "/join/:token",
  signUp: "/sign-up",
  acceptInvite: "/invite/accept/:token",
  verify: "/verify",
  login: "/log-in",
  loginWithRedirect: "/log-in?redirectUrl",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password",
  accountSettings: "/account/settings(/:settingsTab)",
  orgs: "/orgs",
  org: [
    "/orgs/:slug(/)",
    `(/${OrgTab.ProfilePreview})`,
    // Org sections:
    `(/${OrgTab.Dashboard})`,
    `(/${OrgTab.Workflows}(/new)(/:workflowId(/crawls/:itemId(/review/:qaTab))))`,
    `(/${OrgTab.Items}(/:itemType(/:itemId)))`,
    `(/${OrgTab.Collections}(/new)(/view/:collectionId(/:collectionTab)))`,
    `(/${OrgTab.BrowserProfiles}(/profile(/browser/:browserId)(/:browserProfileId)))`,
    `(/${OrgTab.Settings}(/:settingsTab))`,
  ].join(""),
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
  // Redirect for https://github.com/webrecorder/browsertrix-cloud/issues/935
  awpUploadRedirect: "/orgs/:orgId/artifacts/upload/:uploadId",
} as const;
