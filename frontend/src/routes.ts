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
  myAccount: "/my-account",
  accountSettings: "/account/settings",
  archives: "/archives",
  archive: "/archives/:id/:tab",
  archiveNewResourceTab: "/archives/:id/:tab/new",
  archiveAddMember: "/archives/:id/:tab/add-member",
  crawlTemplate: "/archives/:id/crawl-templates/:crawlConfigId",
  crawlTemplateEdit: "/archives/:id/crawl-templates/:crawlConfigId?edit",
  users: "/users",
  usersInvite: "/users/invite",
} as const;

export const DASHBOARD_ROUTE = ROUTES.archives;
