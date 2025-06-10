import { expect, fixture } from "@open-wc/testing";
import { html } from "lit";
import { restore, stub } from "sinon";

import "./general";

import type { OrgSettingsGeneral } from "./general";

import mockAPIUser from "@/__mocks__/api/users/me.js";
import { AppStateService } from "@/utils/state";

describe("btrix-org-settings-general", () => {
  beforeEach(() => {
    AppStateService.resetAll();
    window.localStorage.clear();
    window.sessionStorage.clear();
    stub(window.history, "pushState");
  });

  afterEach(() => {
    restore();
  });

  describe("#renameOrg", () => {
    it("redirects to the correct page", async () => {
      const el = await fixture<OrgSettingsGeneral>(
        html`<btrix-org-settings-general></btrix-org-settings-general>`,
      );

      stub(el.navigate, "to");
      stub(el.api, "fetch").callsFake(async (path) => {
        if (path === "/users/me") {
          return Promise.resolve(mockAPIUser);
        }
        return Promise.resolve({});
      });

      // @ts-expect-error renameOrg is private
      await el.renameOrg({ name: "Fake Org Name 2", slug: "fake-org-name-2" });

      expect(el.navigate.to).to.have.been.calledWith(
        "/orgs/fake-org-name-2/settings",
      );
    });
  });
});
