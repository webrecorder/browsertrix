import { expect, fixture, oneEvent } from "@open-wc/testing";
import type { SlInput } from "@shoelace-style/shoelace";
import { html } from "lit/static-html.js";
import { restore, stub } from "sinon";

import { OrgForm } from "./org-form";

import AuthService from "@/utils/AuthService";
import { AppStateService } from "@/utils/state";

describe("btrix-org-form", () => {
  beforeEach(() => {
    AuthService.broadcastChannel = new BroadcastChannel(AuthService.storageKey);
    window.localStorage.clear();
    window.sessionStorage.clear();
    stub(window.history, "pushState");
  });

  afterEach(() => {
    AuthService.broadcastChannel.close();
    restore();
  });

  it("sets the default name value from property", async () => {
    stub(OrgForm.prototype, "_renameOrg");
    const el = await fixture<OrgForm>(
      html`<btrix-org-form
        id="fake_oid"
        name="Fake Org Name"
      ></btrix-org-form>`,
    );

    const inputEl = el.shadowRoot?.querySelector<SlInput>(
      "sl-input[name='orgName']",
    );

    await inputEl?.updateComplete;

    expect(inputEl).attribute("value", "Fake Org Name");
  });

  it("sets the default slug value from property", async () => {
    stub(OrgForm.prototype, "_renameOrg");
    const el = await fixture<OrgForm>(
      html`<btrix-org-form
        id="fake_oid"
        slug="fake-org-name"
      ></btrix-org-form>`,
    );

    const inputEl = el.shadowRoot?.querySelector<SlInput>(
      "sl-input[name='orgSlug']",
    );

    await inputEl?.updateComplete;

    expect(inputEl).attribute("value", "fake-org-name");
  });

  describe("#_renameOrg", () => {
    it("updates user app state on success", async () => {
      const el = await fixture<OrgForm>(
        html`<btrix-org-form id="fake_oid"></btrix-org-form>`,
      );
      stub(el._api, "fetch").callsFake(() => Promise.resolve());
      stub(el, "_getCurrentUser").callsFake(() =>
        Promise.resolve({
          id: "fake_user_id",
          email: "fake@example.com",
          name: "Fake User",
          is_verified: false,
          is_superuser: false,
          orgs: [],
        }),
      );
      stub(AppStateService, "updateUserInfo");
      stub(AppStateService, "updateOrgSlug");

      await el._renameOrg("fake_oid", {
        name: "Fake Org Name 2",
        slug: "fake-org-name-2",
      });

      expect(AppStateService.updateUserInfo).to.have.callCount(1);
      expect(AppStateService.updateOrgSlug).to.have.callCount(1);
    });

    it("fires the correct event on success", async () => {
      const el = await fixture<OrgForm>(
        html`<btrix-org-form id="fake_oid"></btrix-org-form>`,
      );
      stub(el._api, "fetch").callsFake(() => Promise.resolve());
      stub(el, "_getCurrentUser").callsFake(() =>
        Promise.resolve({
          id: "fake_user_id",
          email: "fake@example.com",
          name: "Fake User",
          is_verified: false,
          is_superuser: false,
          orgs: [],
        }),
      );

      const listener = oneEvent(el, "btrix-org-updated");

      el._renameOrg("fake_oid", {
        name: "Fake Org Name 2",
        slug: "fake-org-name-2",
      });

      const { detail } = await listener;

      expect(detail.data.name).to.equal("Fake Org Name 2");
      expect(detail.data.slug).to.equal("fake-org-name-2");
    });
  });
});
