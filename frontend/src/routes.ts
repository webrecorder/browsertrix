const REGISTRATION_ENABLED = process.env.REGISTRATION_ENABLED === "true";
const ROUTES = {
  home: "/",
  join: "/join/:token?email",
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

if (REGISTRATION_ENABLED) {
  (ROUTES as any).signUp = "/sign-up";
}

export { ROUTES };
export const DASHBOARD_ROUTE = ROUTES.archives;
