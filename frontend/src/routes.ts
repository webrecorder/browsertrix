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
    "(/workflows)",
    "(/archive/items(/:itemType(/:itemId)))",
    "(/collections(/new)(/view/:collectionId(/:collectionTab))(/edit/:collectionId))",
    "(/browser-profiles(/profile(/browser/:browserId)(/:browserProfileId)))",
    "(/settings(/members))",
    // // Optional segments:
    // "(/items(/:itemType)(/:itemId))",
    // "(/new)",
    // "(/view/:collectionId(/:collectionTab))",
    // "(/edit/:collectionId)",
    // "(/crawls)",
    // "(/profile(/:browserProfileId)(/browser/:browserId))",
    // "(/members)",
  ].join(""),
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
} as const;

export const DASHBOARD_ROUTE = "/";
