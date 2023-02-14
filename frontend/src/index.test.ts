import { spy, stub, mock, restore } from "sinon";
import { fixture, expect } from "@open-wc/testing";

import AuthService from "./utils/AuthService";
import { App } from "./index";

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
      })
    );
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).lightDom.descendants("btrix-home");
  });

  it("renders when `AuthService.initSessionStorage` rejects", async () => {
    stub(AuthService, "initSessionStorage").returns(Promise.reject());
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).lightDom.descendants("btrix-home");
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
    const el = (await fixture("<browsertrix-app></browsertrix-app>")) as App;

    expect(el.authService.authState).to.eql({
      headers: "_fake_headers_",
      tokenExpiresAt: "_fake_tokenExpiresAt_",
      username: "test-auth@example.com",
    });
  });

  it("sets user info", async () => {
    stub(App.prototype, "getUserInfo").callsFake(() =>
      Promise.resolve({
        id: "test_id",
        email: "test-user@example.com",
        name: "Test User",
        is_verified: false,
        is_superuser: false,
        orgs: [
          {
            id: "test_org_id",
            name: "test org",
            role: 10,
            email: "test@org.org",
          },
        ],
      })
    );
    stub(AuthService.prototype, "startFreshnessCheck");
    stub(window.sessionStorage, "getItem").callsFake((key) => {
      if (key === "btrix.auth")
        return JSON.stringify({
          username: "test-auth@example.com",
        });
      return null;
    });
    const el = (await fixture("<browsertrix-app></browsertrix-app>")) as App;

    expect(el.userInfo).to.eql({
      id: "test_id",
      email: "test-user@example.com",
      name: "Test User",
      isVerified: false,
      isAdmin: false,
      orgs: [
        {
          id: "test_org_id",
          name: "test org",
          role: 10,
          email: "test@org.org",
        },
      ],
    });
  });
});
