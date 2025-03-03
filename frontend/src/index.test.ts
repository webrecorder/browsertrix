import { expect, fixture } from "@open-wc/testing";
import { html } from "lit";
import { restore, stub } from "sinon";

import { NavigateController } from "./controllers/navigate";
import { NotifyController } from "./controllers/notify";
import { type AppSettings } from "./utils/app";
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

const mockAppSettings: AppSettings = {
  registrationEnabled: false,
  jwtTokenLifetime: 86400,
  defaultBehaviorTimeSeconds: 300,
  defaultPageLoadTimeSeconds: 120,
  maxPagesPerCrawl: 50000,
  numBrowsers: 2,
  maxScale: 3,
  billingEnabled: false,
  signUpUrl: "",
  salesEmail: "",
  supportEmail: "",
  localesEnabled: ["en", "es"],
};

describe("browsertrix-app", () => {
  beforeEach(() => {
    AppStateService.resetAll();
    AuthService.broadcastChannel = new BroadcastChannel(AuthService.storageKey);
    window.sessionStorage.clear();
    window.localStorage.clear();
    stub(window.history, "pushState");
    stub(NotifyController.prototype, "toast");
  });

  afterEach(() => {
    AuthService.broadcastChannel.close();
    restore();
  });

  it("is defined", async () => {
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).instanceOf(App);
  });

  it("don't block render if settings aren't defined", async () => {
    stub(AuthService, "initSessionStorage").returns(
      Promise.resolve({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: 0,
        username: "test-auth@example.com",
      }),
    );
    // @ts-expect-error checkFreshness is private
    stub(AuthService.prototype, "checkFreshness");
    const el = await fixture<App>(html` <browsertrix-app></browsertrix-app>`);
    await el.updateComplete;

    expect(el.shadowRoot?.childElementCount).to.not.equal(0);
  });

  it("renders org when authenticated", async () => {
    stub(AuthService, "initSessionStorage").returns(
      Promise.resolve({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: 0,
        username: "test-auth@example.com",
      }),
    );
    // @ts-expect-error checkFreshness is private
    stub(AuthService.prototype, "checkFreshness");
    AppStateService.updateOrgSlug("fake-org");
    const el = await fixture<App>(
      html` <browsertrix-app .settings=${mockAppSettings}></browsertrix-app>`,
    );
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector("btrix-org")).to.exist;
  });

  it("renders log in when not authenticated", async () => {
    stub(AuthService, "initSessionStorage").returns(Promise.resolve(null));
    // @ts-expect-error checkFreshness is private
    stub(AuthService.prototype, "checkFreshness");
    stub(NavigateController, "createNavigateEvent").callsFake(
      () =>
        new CustomEvent("x-ignored", {
          detail: { url: "", resetScroll: false },
        }),
    );

    const el = await fixture<App>(
      html` <browsertrix-app .settings=${mockAppSettings}></browsertrix-app>`,
    );
    expect(el.shadowRoot?.querySelector("btrix-log-in")).to.exist;
  });

  // TODO move tests to AuthService
  it("sets auth state from session storage", async () => {
    stub(AuthService.prototype, "startFreshnessCheck").callsFake(() => {});
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
    stub(AuthService.prototype, "startFreshnessCheck").callsFake(() => {});
    stub(AuthService, "initSessionStorage").callsFake(async () =>
      Promise.resolve({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: 0,
        username: "test-auth@example.com",
      }),
    );

    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.appState.userInfo).to.eql(mockUserInfo);
  });

  it("sets default org slug", async () => {
    stub(App.prototype, "getLocationPathname").callsFake(() => `/`);
    stub(App.prototype, "getUserInfo").callsFake(async () =>
      Promise.resolve(mockAPIUser),
    );
    stub(AuthService.prototype, "startFreshnessCheck").callsFake(() => {});
    stub(AuthService, "initSessionStorage").callsFake(async () =>
      Promise.resolve({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: 0,
        username: "test-auth@example.com",
      }),
    );
    stub(AuthService, "createNeedLoginEvent").callsFake(
      () => new CustomEvent("x-ignored", { detail: {} }),
    );

    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.appState.orgSlug).to.equal("test-org");
  });

  it("sets org slug from path if user is in org", async () => {
    const id = self.crypto.randomUUID();
    const mockOrg = {
      id: id,
      name: "test org 2",
      slug: id,
      role: 10,
    };
    AppStateService.updateUser(
      formatAPIUser({
        ...mockAPIUser,
        orgs: [...mockAPIUser.orgs, mockOrg],
      }),
    );
    stub(App.prototype, "getLocationPathname").callsFake(() => `/orgs/${id}`);
    stub(AuthService.prototype, "startFreshnessCheck").callsFake(() => {});
    stub(AuthService, "initSessionStorage").callsFake(async () =>
      Promise.resolve({
        headers: { Authorization: "_fake_headers_" },
        tokenExpiresAt: 0,
        username: "test-auth@example.com",
      }),
    );

    const el = await fixture<App>("<browsertrix-app></browsertrix-app>");

    expect(el.appState.orgSlug).to.equal(id);
  });
});
