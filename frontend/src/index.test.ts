import { spy, stub } from "sinon";
import { fixture, expect } from "@open-wc/testing";
// import { expect } from "@esm-bundle/chai";

import { App } from "./index";

describe("browsertrix-app", () => {
  it("is defined", async () => {
    const el = await fixture("<browsertrix-app></browsertrix-app>");
    expect(el).instanceOf(App);
  });

  it("gets auth state from local storage", async () => {
    stub(window.localStorage, "getItem").callsFake((key) => {
      if (key === "authState")
        return JSON.stringify({
          username: "test@example.com",
        });
      return null;
    });
    const el = (await fixture("<browsertrix-app></browsertrix-app>")) as App;

    expect(el.authState).to.eql({
      username: "test@example.com",
    });
  });
});
