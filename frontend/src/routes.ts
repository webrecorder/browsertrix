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
  accountSettings: "/account/settings",
  orgs: "/orgs",
  org: [
    "/orgs/:orgId",
    // Org sections:
    "(/workflows(/crawls)(/crawl/:workflowId))",
    "(/items(/:itemType(/:itemId)))",
    "(/collections(/new)(/view/:collectionId(/:collectionTab))(/edit/:collectionId))",
    "(/browser-profiles(/profile(/browser/:browserId)(/:browserProfileId)))",
    "(/settings(/members))",
  ].join(""),
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
  // Redirect for https://github.com/webrecorder/browsertrix-cloud/issues/935
  awpUploadRedirect: "/orgs/:orgId/artifacts/upload/:uploadId",
} as const;

export const DASHBOARD_ROUTE = "/";
