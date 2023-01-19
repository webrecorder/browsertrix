export const ROUTES = {
  home: "/",
  join: "/join/:token?email",
  signUp: "/sign-up",
  acceptInvite: "/invite/accept/:token?email",
  verify: "/verify?token",
  login: "/log-in",
  loginWithRedirect: "/log-in?redirectUrl",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password?token",
  accountSettings: "/account/settings",
  orgs: "/orgs",
  org: "/orgs/:id/:tab",
  orgNewResourceTab: "/orgs/:id/:tab/new",
  orgAddMember: "/orgs/:id/:tab/add-member",
  orgCrawl: "/orgs/:id/:tab/crawl/:crawlId",
  browserProfile: "/orgs/:id/:tab/profile/:browserProfileId",
  browser:
    "/orgs/:id/:tab/profile/browser/:browserId?name&description&profileId&navigateUrl",
  crawlTemplate: "/orgs/:id/:tab/config/:crawlConfigId",
  crawlTemplateEdit: "/orgs/:id/:tab/config/:crawlConfigId?edit",
  crawlTemplateNew: "/orgs/:id/:tab/config/new?jobType",
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
} as const;

export const DASHBOARD_ROUTE = ROUTES.home;
