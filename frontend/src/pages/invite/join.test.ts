import { expect, fixture, oneEvent } from "@open-wc/testing";
import { html } from "lit/static-html.js";
import { restore, stub } from "sinon";

import { Join } from "./join";

import type { OrgForm, OrgUpdatedDetail } from "@/pages/invite/ui/org-form";
import AuthService from "@/utils/AuthService";
import { AppStateService } from "@/utils/state";

const mockInviteInfo = {
  inviterEmail: "inviter_fake_email@example.com",
  inviterName: "Inviter Fake Name",
  fromSuperuser: false,
  firstOrgAdmin: false,
  role: 0,
  oid: "fake_oid",
  orgName: "Fake Org Name",
  orgSlug: "fake-org-name",
};

describe("btrix-join", () => {
  beforeEach(() => {
    AppStateService.resetAll();
    AuthService.broadcastChannel = new BroadcastChannel(AuthService.storageKey);
    window.localStorage.clear();
    window.sessionStorage.clear();
    stub(window.history, "pushState");
  });

  afterEach(() => {
    AuthService.broadcastChannel.close();
    restore();
  });

  it("gets invite info when token and email are present", async () => {
    stub(Join.prototype, "_getInviteInfo");
    const el = await fixture<Join>(
      html`<btrix-join
        token="my_fake_invite_token"
        email="my_fake_email@example.com"
      ></btrix-join>`,
    );
    expect(el._getInviteInfo).to.have.callCount(1);
  });

  describe("when inviting the first admin", () => {
    beforeEach(() => {
      stub(Join.prototype, "_getInviteInfo").callsFake(async () =>
        Promise.resolve({
          ...mockInviteInfo,
          firstOrgAdmin: true,
        }),
      );
    });

    it("renders user registration form", async () => {
      const el = await fixture<Join>(
        html`<btrix-join
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-join>`,
      );

      await el.updateComplete;

      expect(el).lightDom.to.contain("btrix-sign-up-form");
    });

    it("renders org rename form when registered", async () => {
      const el = await fixture<Join>(
        html`<btrix-join
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-join>`,
      );
      el._onSignUpSuccess(
        new CustomEvent("fake--success", {
          detail: { orgName: "Fake Org Name 2", orgSlug: "fake-org-slug-2" },
        }),
      );
      el._onAuthenticated(new CustomEvent("fake--authenticated"));
      stub(el, "_isLoggedIn").get(() => true);

      await el.updateComplete;

      expect(el).lightDom.to.contain("btrix-org-form");
    });

    it("renders org rename form with the correct attributes", async () => {
      const el = await fixture<Join>(
        html`<btrix-join
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-join>`,
      );
      el._onSignUpSuccess(
        new CustomEvent("fake--success", {
          detail: { orgName: "Fake Org Name 2", orgSlug: "fake-org-slug-2" },
        }),
      );
      el._onAuthenticated(new CustomEvent("fake--authenticated"));
      stub(el, "_isLoggedIn").get(() => true);

      await el.updateComplete;

      const orgFormEl = el.querySelector<OrgForm>("btrix-org-form");

      expect(orgFormEl).attribute("newOrgId", "fake_oid");
      expect(orgFormEl).attribute("name", "Fake Org Name 2");
      expect(orgFormEl).attribute("slug", "fake-org-slug-2");
    });

    it("redirects to org dashboard on successful org rename", async () => {
      const el = await fixture<Join>(
        html`<btrix-join
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-join>`,
      );
      stub(el, "navTo");
      stub(el, "_isLoggedIn").get(() => true);
      el._firstAdminOrgInfo = {
        id: mockInviteInfo.oid,
        name: mockInviteInfo.orgName,
        slug: mockInviteInfo.orgSlug,
      };

      await el.updateComplete;

      const orgFormEl = el.querySelector<OrgForm>("btrix-org-form")!;

      setTimeout(() => {
        orgFormEl.dispatchEvent(
          new CustomEvent<OrgUpdatedDetail>("btrix-org-updated", {
            detail: {
              data: {
                name: "Fake Org Name 2",
                slug: "fake-org-slug-2",
              },
            },
          }),
        );
      });

      await oneEvent(orgFormEl, "btrix-org-updated");

      expect(el.navTo).to.have.been.calledWith(
        "/orgs/fake-org-slug-2/dashboard",
      );
    });
  });

  describe("when inviting a non-first admin", () => {
    beforeEach(() => {
      stub(Join.prototype, "_getInviteInfo").callsFake(async () =>
        Promise.resolve({
          ...mockInviteInfo,
          firstOrgAdmin: false,
        }),
      );
    });

    it("renders user registration form", async () => {
      const el = await fixture<Join>(
        html`<btrix-join
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-join>`,
      );

      await el.updateComplete;

      expect(el).lightDom.to.contain("btrix-sign-up-form");
    });

    it("redirects to org dashboard when registered", async () => {
      const el = await fixture<Join>(
        html`<btrix-join
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-join>`,
      );
      stub(el, "navTo");
      el._onSignUpSuccess(
        new CustomEvent("fake--success", {
          detail: {},
        }),
      );
      el._onAuthenticated(new CustomEvent("fake--authenticated"));
      stub(el, "_isLoggedIn").get(() => true);

      await el.updateComplete;

      expect(el.navTo).to.have.been.calledWith("/orgs/fake-org-name/dashboard");
    });
  });
});
