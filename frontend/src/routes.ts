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
    "(/crawl/:crawlId)",
    "(/config/:crawlConfigId)",
    "(/profile(/:browserProfileId)(/browser/:browserId))",
    "(/members)",
  ].join(""),
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
} as const;

export const DASHBOARD_ROUTE = ROUTES.home;
