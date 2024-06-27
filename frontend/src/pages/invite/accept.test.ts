import { expect, fixture, fixtureSync, oneEvent } from "@open-wc/testing";
import { html } from "lit/static-html.js";
import { match, restore, stub } from "sinon";

import { AcceptInvite } from "./accept";

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
const mockAuthState = {
  username: "my_fake_email@example.com",
  headers: { Authorization: "fake_auth_header" },
  tokenExpiresAt: 0,
};

describe("btrix-accept-invite", () => {
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

  it("redirects if not logged in", () => {
    const el = fixtureSync<AcceptInvite>(
      html`<btrix-accept-invite
        .authState=${null}
        token="my_fake_invite_token"
        email="my_fake_email@example.com"
      ></btrix-accept-invite>`,
    );
    stub(el._navigate, "to");
    el.firstUpdated();

    expect(el._navigate.to).to.have.calledWith(match("/log-in?redirectUrl="));
  });

  it("gets invite info when auth state and token are present", async () => {
    stub(AcceptInvite.prototype, "_getInviteInfo");
    const el = await fixture<AcceptInvite>(
      html`<btrix-accept-invite
        .authState=${mockAuthState}
        token="my_fake_invite_token"
        email="my_fake_email@example.com"
      ></btrix-accept-invite>`,
    );
    expect(el._getInviteInfo).to.have.callCount(1);
  });

  describe("when inviting the first admin", () => {
    beforeEach(() => {
      stub(AcceptInvite.prototype, "_getInviteInfo").callsFake(async () =>
        Promise.resolve({
          ...mockInviteInfo,
          firstOrgAdmin: true,
        }),
      );
    });

    it("renders accept button", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );

      expect(el.shadowRoot!.querySelector("#acceptButton")).to.exist;
    });

    it("redirects to home on decline", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );

      stub(el._navigate, "to");

      await el._onDecline();

      expect(el._navigate.to).to.have.calledWith(el._navigate.orgBasePath);
    });

    it("renders org settings form when accepted", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );

      stub(el._api, "fetch").callsFake(async () =>
        Promise.resolve({
          org: {
            id: mockInviteInfo.oid,
            name: mockInviteInfo.orgName,
            slug: mockInviteInfo.orgSlug,
          },
        }),
      );

      await el._onAccept();

      expect(el.shadowRoot!.querySelector<OrgForm>("btrix-org-form")).to.exist;
    });

    it("renders org settings form with the correct attributes", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );

      stub(el._api, "fetch").callsFake(async () =>
        Promise.resolve({
          org: {
            id: mockInviteInfo.oid,
            name: "Fake Org Name 2",
            slug: "fake-org-slug-2",
          },
        }),
      );

      await el._onAccept();

      const orgFormEl = el.shadowRoot!.querySelector<OrgForm>("btrix-org-form");

      expect(orgFormEl).attribute("orgId", "fake_oid");
      expect(orgFormEl).attribute("name", "Fake Org Name 2");
      expect(orgFormEl).attribute("slug", "fake-org-slug-2");
    });

    it("redirects to org dashboard on successful org rename", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );
      stub(el._navigate, "to");
      stub(el, "_isLoggedIn").get(() => true);
      el._firstAdminOrgInfo = {
        id: mockInviteInfo.oid,
        name: mockInviteInfo.orgName,
        slug: mockInviteInfo.orgSlug,
      };

      await el.updateComplete;

      const orgFormEl =
        el.shadowRoot!.querySelector<OrgForm>("btrix-org-form")!;

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

      expect(el._navigate.to).to.have.been.calledWith("/orgs/fake-org-slug-2");
    });
  });

  describe("when inviting a non-first admin", () => {
    beforeEach(() => {
      stub(AcceptInvite.prototype, "_getInviteInfo").callsFake(async () =>
        Promise.resolve({
          ...mockInviteInfo,
          firstOrgAdmin: false,
        }),
      );
    });

    it("renders accept button", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );

      expect(el.shadowRoot!.querySelector("#acceptButton")).to.exist;
    });

    it("updates user app state on accept", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );

      stub(el._navigate, "to");
      stub(el._api, "fetch").callsFake(async () =>
        Promise.resolve({
          org: {
            id: mockInviteInfo.oid,
            name: mockInviteInfo.orgName,
            slug: mockInviteInfo.orgSlug,
          },
        }),
      );
      stub(el, "_getCurrentUser").callsFake(async () =>
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

      await el._onAccept();

      expect(AppStateService.updateUserInfo).to.have.callCount(1);
      expect(AppStateService.updateOrgSlug).to.have.callCount(1);
    });

    it("redirects to org dashboard on accept", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );

      stub(el._navigate, "to");
      stub(el._api, "fetch").callsFake(async () =>
        Promise.resolve({
          org: {
            id: mockInviteInfo.oid,
            name: mockInviteInfo.orgName,
            slug: mockInviteInfo.orgSlug,
          },
        }),
      );

      await el._onAccept();

      expect(el._navigate.to).to.have.calledWith("/orgs/fake-org-name");
    });

    it("redirects to home on decline", async () => {
      const el = await fixture<AcceptInvite>(
        html`<btrix-accept-invite
          .authState=${mockAuthState}
          token="my_fake_invite_token"
          email="my_fake_email@example.com"
        ></btrix-accept-invite>`,
      );

      stub(el._navigate, "to");

      await el._onDecline();

      expect(el._navigate.to).to.have.calledWith(el._navigate.orgBasePath);
    });
  });
});
