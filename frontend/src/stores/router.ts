import { createRouter } from "@nanostores/router";

const WORKFLOW_ROUTES = {
  crawlWorkflows: "/workflows/crawls",
  crawlWorkflow: "/workflows/crawl/:workflowId",
};

const ARCHIVED_ITEM_ROUTES = {
  items: /\/items\/(?<itemType>crawl|upload)/,
  item: /\/items\/(?<itemType>crawl|upload)\/(?<itemId>\d+)/,
  itemReview: "/items/crawl/:itemId/review/:qaTab",
};

const COLLECTION_ROUTES = {
  collections: "/collections",
  collection: "/collections/view/:collectionId/:collectionTab?",
};

const BROWSER_PROFILE_ROUTES = {
  browserProfiles: "/browser-profiles",
  browserProfile: "/browser-profiles/profile/:browserProfileId",
  newBrowserProfile: "/browser-profiles/profile/browser/:browserId",
};

const ORG_ROUTES = {
  org: "/orgs/:slug",
  ...WORKFLOW_ROUTES,
  ...ARCHIVED_ITEM_ROUTES,
  ...COLLECTION_ROUTES,
  ...BROWSER_PROFILE_ROUTES,
} as const;

export const ROUTES = {
  home: "/",
  join: "/join/:token",
  signUp: "/sign-up",
  acceptInvite: "/invite/accept/:token",
  verify: "/verify",
  login: "/log-in",
  loginWithRedirect: "/log-in",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password",
  accountSettings: "/account/settings",
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
  ...ORG_ROUTES,
  // Redirect for https://github.com/webrecorder/browsertrix-cloud/issues/935
  awpUploadRedirect: "/orgs/:orgId/artifacts/upload/:uploadId",
} as const;

export const $router = createRouter(ROUTES);
