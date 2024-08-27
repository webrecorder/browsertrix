import { createRouter } from "@nanostores/router";

const WORKFLOW_ROUTES = {
  crawlWorkflows: "/orgs/:slug/workflows/crawls",
  crawlWorkflow: "/orgs/:slug/workflows/crawl/:workflowId",
};

const ARCHIVED_ITEM_ROUTES = {
  items: "/orgs/:slug/items/:itemType?",
  item: "/orgs/:slug/items/:itemType/:itemId",
  itemReview: "/orgs/:slug/items/crawl/:itemId/review/:qaTab",
};

const COLLECTION_ROUTES = {
  collections: "/orgs/:slug/collections",
  collection: "/orgs/:slug/collections/view/:collectionId/:collectionTab?",
};

const BROWSER_PROFILE_ROUTES = {
  browserProfiles: "/orgs/:slug/browser-profiles",
  browserProfile: "/orgs/:slug/browser-profiles/profile/:browserProfileId",
  newBrowserProfile: "/orgs/:slug/browser-profiles/profile/browser/:browserId",
};

export const ORG_ROUTES = {
  orgDashboard: "/orgs/:slug",
  orgSettings: "/orgs/:slug/settings/:settingsTab?",
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

export const $router = createRouter(ROUTES, { links: false });
