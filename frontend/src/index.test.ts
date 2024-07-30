import { expect, fixture } from "@open-wc/testing";
import { restore, stub } from "sinon";

import AuthService from "./utils/AuthService";
import { AppStateService } from "./utils/state";
import { formatAPIUser } from "./utils/user";

import { App, type APIUser } from ".";

const mockAPIUser: APIUser = {
  id: "740d7b63-b257-4311-ba3f-adc46a5fafb8",
  email: "test-user@example.com",
  name: "Test User",
  is_verified: false,
  is_superuser: false,
  orgs: [
    {
      id: "e21ab647-2d0e-489d-97d1-88ac91774942",
      name: "test org",
      slug: "test-org",
      role: 10,
    },
  ],
};
const mockUserInfo = formatAPIUser(mockAPIUser);

describe("browsertrix-app", () => {
  beforeEach(() => {
    AppStateService.resetAll();
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
          headers: { Authorization: "_fake_headers_" },
          tokenExpiresAt: 0,
          username: "test-auth@example.com",
        });
      return null;
    });
    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.authService.authState).to.eql({
      headers: { Authorization: "_fake_headers_" },
      tokenExpiresAt: 0,
      username: "test-auth@example.com",
    });
  });

  it("sets user info", async () => {
    stub(App.prototype, "getUserInfo").callsFake(async () =>
      Promise.resolve(mockAPIUser),
    );
    stub(AuthService.prototype, "startFreshnessCheck");
    stub(window.sessionStorage, "getItem").callsFake((key) => {
      if (key === "btrix.auth")
        return JSON.stringify({
          headers: { Authorization: "_fake_headers_" },
          tokenExpiresAt: 0,
          username: "test-auth@example.com",
        });
      return null;
    });
    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.appState.userInfo).to.eql(mockUserInfo);
  });
});
