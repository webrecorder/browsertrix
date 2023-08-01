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
    "/orgs/:orgId/:orgTab",
    // Optional segments:
    "(/new)",
    "(/view/:resourceId(/:resourceTab))",
    "(/edit/:resourceId)",
    "(/crawls)",
    "(/crawl/:crawlOrWorkflowId)",
    "(/upload/:crawlOrWorkflowId)",
    "(/artifact/:artifactId)",
    "(/profile(/:browserProfileId)(/browser/:browserId))",
    "(/members)",
  ].join(""),
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
} as const;

export const DASHBOARD_ROUTE = "/";
