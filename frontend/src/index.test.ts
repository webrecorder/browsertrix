import { spy, stub, mock, restore } from "sinon";
import { fixture, expect } from "@open-wc/testing";
// import { expect } from "@esm-bundle/chai";

import { App } from "./index";

describe("browsertrix-app", () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
    restore();
  });

  it("is defined", async () => {
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).instanceOf(App);
  });

  it("sets auth state from session storage", async () => {
    stub(window.sessionStorage, "getItem").callsFake((key) => {
      if (key === "btrix.auth")
        return JSON.stringify({
          username: "test-auth@example.com",
        });
      return null;
    });
    const el = (await fixture("<browsertrix-app></browsertrix-app>")) as App;

    expect(el.authService.authState).to.eql({
      username: "test-auth@example.com",
    });
  });

  it("sets user info", async () => {
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
    });
  });
});
