import { expect, fixture } from "@open-wc/testing";
import { restore, stub } from "sinon";
import { v4 as uuidv4 } from "uuid";

import AuthService from "./utils/AuthService";

import { App, type APIUser } from ".";

const mockUUID = uuidv4();
// TODO generate from schema
const mockUserOrg = {
  role: 10,
  id: mockUUID,
  name: "test org",
  created: null,
  slug: "test-org",
  default: false,
  quotas: {},
  bytesStored: 100,
  bytesStoredCrawls: 1,
  bytesStoredUploads: 1,
  bytesStoredProfiles: 1,
  usage: null,
  crawlExecSeconds: {},
  monthlyExecSeconds: {},
  extraExecSeconds: {},
  giftedExecSeconds: {},
  extraExecSecondsAvailable: 0,
  giftedExecSecondsAvailable: 0,
  users: {},
  subscription: null,
};

describe("browsertrix-app", () => {
  beforeEach(() => {
    AuthService.broadcastChannel = new BroadcastChannel(AuthService.storageKey);
    window.sessionStorage.clear();
    stub(window.history, "pushState");
  });

  afterEach(() => {
    AuthService.broadcastChannel.close();
    restore();
  });

  it("is defined", async () => {
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).instanceOf(App);
  });

  it("renders home when authenticated", async () => {
    stub(AuthService, "initSessionStorage").returns(
      Promise.resolve({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: 0,
        username: "test-auth@example.com",
      }),
    );
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).lightDom.descendants("btrix-home");
  });

  it("renders when `AuthService.initSessionStorage` rejects", async () => {
    stub(AuthService, "initSessionStorage").returns(Promise.reject());
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).lightDom.descendants("btrix-log-in");
  });

  // TODO move tests to AuthService
  it("sets auth state from session storage", async () => {
    stub(AuthService.prototype, "startFreshnessCheck");
    stub(window.sessionStorage, "getItem").callsFake((key) => {
      if (key === "btrix.auth")
        return JSON.stringify({
          headers: "_fake_headers_",
          tokenExpiresAt: "_fake_tokenExpiresAt_",
          username: "test-auth@example.com",
        });
      return null;
    });
    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.authService.authState).to.eql({
      headers: "_fake_headers_",
      tokenExpiresAt: "_fake_tokenExpiresAt_",
      username: "test-auth@example.com",
    });
  });

  it("sets user info", async () => {
    stub(App.prototype, "getUserInfo").callsFake(async () =>
      Promise.resolve({
        id: mockUUID,
        email: "test-user@example.com",
        name: "Test User",
        is_verified: false,
        is_superuser: false,
        orgs: [mockUserOrg],
      } as APIUser),
    );
    stub(AuthService.prototype, "startFreshnessCheck");
    stub(window.sessionStorage, "getItem").callsFake((key) => {
      if (key === "btrix.auth")
        return JSON.stringify({
          username: "test-auth@example.com",
        });
      return null;
    });
    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.appState.userInfo).to.eql({
      id: mockUUID,
      email: "test-user@example.com",
      name: "Test User",
      isVerified: false,
      isSuperAdmin: false,
      orgs: [mockUserOrg],
    });
  });
});
