export const ROUTES = {
  home: "/",
  join: "/join/:token?email",
  signUp: "/sign-up",
  verify: "/verify?token",
  login: "/log-in",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password?token",
  myAccount: "/my-account",
  accountSettings: "/account/settings",
  archives: "/archives",
  archive: "/archives/:id/:tab",
  archiveAddMember: "/archives/:id/:tab/add-member",
  users: "/users",
  usersInvite: "/users/invite",
} as const;

export const DASHBOARD_ROUTE = ROUTES.archives;
