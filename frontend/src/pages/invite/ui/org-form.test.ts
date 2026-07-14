import { expect, fixture, oneEvent } from "@open-wc/testing";
import type { SlInput } from "@shoelace-style/shoelace";
import { html } from "lit/static-html.js";
import { restore, stub } from "sinon";

import { OrgForm } from "./org-form";

import AuthService from "@/utils/AuthService";
import { AppStateService } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

describe("btrix-org-form", () => {
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

  it("sets the default name value from property", async () => {
    stub(OrgForm.prototype, "_renameOrg");
    const el = await fixture<OrgForm>(
      html`<btrix-org-form
        newOrgId="e21ab647-2d0e-489d-97d1-88ac91774942"
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
        newOrgId="e21ab647-2d0e-489d-97d1-88ac91774942"
        slug="fake-org-name"
      ></btrix-org-form>`,
    );

    const inputEl = el.shadowRoot?.querySelector<SlInput>(
      "sl-input[name='orgSlug']",
    );

    await inputEl?.updateComplete;

    expect(inputEl).attribute("value", "fake-org-name");
  });

  it("runs rename task on submit", async () => {
    const el = await fixture<OrgForm>(
      html`<btrix-org-form
        newOrgId="e21ab647-2d0e-489d-97d1-88ac91774942"
      ></btrix-org-form>`,
    );
    stub(el._renameOrgTask, "run");
    stub(el, "_getFormValues").returns({
      orgName: "Fake Org Name",
      orgSlug: "fake-org-slug",
    });

    const form = el.shadowRoot!.querySelector<HTMLFormElement>("form")!;

    const listener = oneEvent(form, "submit");

    form.requestSubmit();

    await el.updateComplete;
    await listener;

    expect(el._renameOrgTask.run).to.have.callCount(1);
  });

  it("renders rename org error", async () => {
    const el = await fixture<OrgForm>(
      html`<btrix-org-form
        newOrgId="e21ab647-2d0e-489d-97d1-88ac91774942"
      ></btrix-org-form>`,
    );
    stub(el, "_renameOrg").callsFake(async () =>
      Promise.reject(new Error("Fake error")),
    );

    await el._renameOrgTask.run([
      "e21ab647-2d0e-489d-97d1-88ac91774942",
      "Fake Org Name",
      "fake-org-name",
    ]);

    expect(el.shadowRoot?.querySelector("btrix-alert")).to.have.text(
      "Fake error",
    );
  });

  describe("#_renameOrg", () => {
    it("updates user app state on success", async () => {
      const user = {
        id: "740d7b63-b257-4311-ba3f-adc46a5fafb8",
        email: "fake@example.com",
        name: "Fake User",
        is_verified: false,
        is_superuser: false,
        orgs: [],
      };
      const el = await fixture<OrgForm>(
        html`<btrix-org-form
          newOrgId="e21ab647-2d0e-489d-97d1-88ac91774942"
        ></btrix-org-form>`,
      );
      stub(el.api, "fetch").callsFake(async () => Promise.resolve());
      stub(el, "_getCurrentUser").callsFake(async () => Promise.resolve(user));
      stub(AppStateService, "updateUser");

      await el._renameOrg("e21ab647-2d0e-489d-97d1-88ac91774942", {
        name: "Fake Org Name 2",
        slug: "fake-org-name-2",
      });

      expect(AppStateService.updateUser).to.have.been.calledWith(
        formatAPIUser(user),
        "fake-org-name-2",
      );
    });

    it("fires the correct event on success", async () => {
      const el = await fixture<OrgForm>(
        html`<btrix-org-form
          newOrgId="e21ab647-2d0e-489d-97d1-88ac91774942"
        ></btrix-org-form>`,
      );
      stub(el.api, "fetch").callsFake(async () => Promise.resolve());
      stub(el, "_getCurrentUser").callsFake(async () =>
        Promise.resolve({
          id: "740d7b63-b257-4311-ba3f-adc46a5fafb8",
          email: "fake@example.com",
          name: "Fake User",
          is_verified: false,
          is_superuser: false,
          orgs: [],
        }),
      );

      const listener = oneEvent(el, "btrix-org-updated");

      el._renameOrg("e21ab647-2d0e-489d-97d1-88ac91774942", {
        name: "Fake Org Name 2",
        slug: "fake-org-name-2",
      });

      const { detail } = await listener;

      expect(detail.data.name).to.equal("Fake Org Name 2");
      expect(detail.data.slug).to.equal("fake-org-name-2");
    });
  });
});
