import { expect, fixture, oneEvent } from "@open-wc/testing";
import { html } from "lit/static-html.js";
import { match, restore, stub } from "sinon";

import type { APIUser } from "..";

import { LogInPage } from "./log-in";

import { ROUTES } from "@/routes";
import APIRouter from "@/utils/APIRouter";
import AuthService from "@/utils/AuthService";
import { AppStateService } from "@/utils/state";

const router = new APIRouter(ROUTES);
const viewState = router.match("/log-in");
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
const mockAuth = {
  headers: { Authorization: self.crypto.randomUUID() },
  tokenExpiresAt: Date.now(),
  username: "test-auth@example.com",
  user: mockAPIUser,
};

describe("<btrix-log-in>", () => {
  beforeEach(() => {
    AppStateService.resetAll();
    stub(window.history, "pushState");
  });

  afterEach(() => {
    restore();
  });

  it("is defined", async () => {
    const el = await fixture<LogInPage>(
      html`<btrix-log-in .viewState=${viewState}></btrix-log-in>`,
    );

    expect(el).instanceOf(LogInPage);
  });

  describe("form submit", () => {
    it("creates logged in event on success", async () => {
      stub(AuthService, "login").callsFake(async () =>
        Promise.resolve(mockAuth),
      );

      const el = await fixture<LogInPage>(
        html`<btrix-log-in .viewState=${viewState}></btrix-log-in>`,
      );
      const form = el.shadowRoot!.querySelector<HTMLFormElement>("form")!;

      const loggedInListener = oneEvent(el, "btrix-logged-in");
      const submitListener = oneEvent(form, "submit");

      form.requestSubmit();

      await submitListener;
      const loggedInEvent = await loggedInListener;

      expect(loggedInEvent.detail.user).to.exist;
    });

    it("updates org slug in state", async () => {
      stub(AuthService, "login").callsFake(async () =>
        Promise.resolve(mockAuth),
      );
      stub(AppStateService, "updateUser");

      const el = await fixture<LogInPage>(
        html`<btrix-log-in .viewState=${viewState}></btrix-log-in>`,
      );
      const form = el.shadowRoot!.querySelector<HTMLFormElement>("form")!;

      const loggedInListener = oneEvent(el, "btrix-logged-in");
      const submitListener = oneEvent(form, "submit");

      form.requestSubmit();

      await submitListener;
      await loggedInListener;

      expect(AppStateService.updateUser).to.have.been.calledWith(
        match.any,
        "test-org",
      );
    });

    it("handles users without org", async () => {
      stub(AuthService, "login").callsFake(async () =>
        Promise.resolve({
          ...mockAuth,
          user: {
            ...mockAPIUser,
            orgs: [],
          },
        }),
      );
      stub(AppStateService, "updateUser");

      const el = await fixture<LogInPage>(
        html`<btrix-log-in .viewState=${viewState}></btrix-log-in>`,
      );
      const form = el.shadowRoot!.querySelector<HTMLFormElement>("form")!;

      const loggedInListener = oneEvent(el, "btrix-logged-in");
      const submitListener = oneEvent(form, "submit");

      form.requestSubmit();

      await submitListener;
      const loggedInEvent = await loggedInListener;

      expect(AppStateService.updateUser).not.to.have.been.called;
      expect(loggedInEvent.detail.user).to.exist;
    });
  });
});
