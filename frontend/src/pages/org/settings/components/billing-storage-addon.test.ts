import { expect, fixture } from "@open-wc/testing";
import { html } from "lit";
import { restore, stub } from "sinon";

import "./billing-storage-addon";

import type { OrgSettingsBillingStorageAddon } from "./billing-storage-addon";

import mockAPIOrg from "@/__mocks__/api/orgs/[id].js";
import mockAPISettings from "@/__mocks__/api/settings.js";
import { APIErrorDetail } from "@/types/api";
import { SubscriptionStatus } from "@/types/billing";
import type { OrgData } from "@/types/org";
import { APIError } from "@/utils/api";
import { AppStateService } from "@/utils/state";

const GB = 1_000_000_000;

const baseOrg = mockAPIOrg as unknown as OrgData;

const makeOrg = (overrides: Partial<OrgData> = {}): OrgData =>
  ({
    ...baseOrg,
    id: "fake-org-id",
    slug: "fake-org",
    quotas: {
      ...baseOrg.quotas,
      storageQuota: 500 * GB,
      extraStorageQuota: 200 * GB,
    },
    bytesStored: 100 * GB,
    subscription: {
      subId: "stripe:sub_test",
      status: SubscriptionStatus.Active,
      planId: "basic",
      readOnlyOnCancel: false,
      futureCancelDate: null,
      renewalDate: "2026-01-01T00:00:00Z",
      storageAddonPendingGB: null,
    },
    ...overrides,
  }) as OrgData;

const withAddon = (sizeGB: number): OrgData =>
  makeOrg({
    quotas: {
      ...baseOrg.quotas,
      storageQuota: 500 * GB,
      extraStorageQuota: sizeGB * GB,
    },
  });

const withPending = (pendingGB: number | null): OrgData =>
  makeOrg({
    subscription: {
      ...makeOrg().subscription!,
      storageAddonPendingGB: pendingGB,
    },
  });

describe("btrix-org-settings-billing-storage-addon", () => {
  let el: OrgSettingsBillingStorageAddon | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    AppStateService.resetAll();
    AppStateService.updateSettings(
      mockAPISettings as unknown as Parameters<
        typeof AppStateService.updateSettings
      >[0],
    );
    stub(window.history, "pushState");
  });

  afterEach(async () => {
    // The poll schedules the next run with window.setTimeout, which would
    // leave a timer running after the test ends. `stop()` pauses the poll
    // and cancels the request it is running.
    // @ts-expect-error catchUpPoll is private
    await el?.catchUpPoll.stop();
    el?.remove();
    el = undefined;
    restore();
  });

  const setup = async (
    org: OrgData,
    fetch: (
      path: string,
      options?: { body?: string },
    ) => Promise<unknown> = async () => ({}),
  ) => {
    el = await fixture<OrgSettingsBillingStorageAddon>(
      html`<btrix-org-settings-billing-storage-addon></btrix-org-settings-billing-storage-addon>`,
    );

    stub(el.api, "fetch").callsFake(fetch as never);

    // The component does nothing unless `env.billingEnabled` is true. The
    // `updateSettings` call above sets a different piece of state, so set
    // `env` here.
    AppStateService.updateEnv({
      version: "test",
      registrationEnabled: false,
      billingEnabled: true,
      docsUrl: "/docs/",
      signUpUrl: "",
    });
    AppStateService.updateOrg(org);
    await el.updateComplete;

    return el;
  };

  /** Record the body of each add-on change request */
  const recordPosts = (posts: unknown[]) =>
    async (path: string, options?: { body?: string }) => {
      if (path.includes("/subscription/storage-addon")) {
        posts.push(options?.body ? JSON.parse(options.body) : undefined);
      }
      return makeOrg();
    };

  describe("confirmation", () => {
    // Each of these changes affects what the customer pays, so the component
    // must wait for the user to confirm before it sends one.
    for (const sizeGB of [1000, 50, 0]) {
      it(`waits for confirmation before setting the add-on to ${sizeGB} GB`, async () => {
        const posts: unknown[] = [];
        const el = await setup(makeOrg(), recordPosts(posts));

        // @ts-expect-error requestChange is private
        el.requestChange(sizeGB);
        expect(posts).to.have.lengthOf(0);

        // @ts-expect-error confirmChange is private
        await el.confirmChange();
        expect(posts).to.deep.equal([{ sizeGB }]);
      });
    }

    it("applies the keep action at once, since it only undoes a pending change", async () => {
      const posts: unknown[] = [];
      const el = await setup(withPending(0), recordPosts(posts));

      // @ts-expect-error requestChange is private
      el.requestChange(200);
      // @ts-expect-error updateTask is private
      await el.updateTask.taskComplete;

      expect(posts).to.deep.equal([{ sizeGB: 200 }]);
    });

    it("does nothing when asked for the size the add-on already has", async () => {
      const posts: unknown[] = [];
      const el = await setup(makeOrg(), recordPosts(posts));

      // @ts-expect-error requestChange is private
      el.requestChange(200);
      await el.updateComplete;
      // @ts-expect-error confirmChange is private
      await el.confirmChange();

      expect(posts).to.have.lengthOf(0);
    });
  });

  describe("below-usage error", () => {
    it("reports the error and does not start polling", async () => {
      const el = await setup(makeOrg(), async (path: string) => {
        if (path.includes("/subscription/storage-addon")) {
          throw new APIError({
            message: "below usage",
            status: 400,
            errorCode: APIErrorDetail.StorageAddonBelowUsage,
          });
        }
        return makeOrg();
      });
      const toastStub = stub(el.notify, "toast");

      // @ts-expect-error updateAddon is private
      await el.updateAddon(50).catch(() => {});

      expect(toastStub.calledOnce).to.be.true;
      // @ts-expect-error catchUpPoll is private
      expect(el.catchUpPoll.value).to.equal(undefined);
    });
  });

  describe("custom amount", () => {
    for (const amount of ["0", "1.5"]) {
      it(`does not ask to confirm ${amount} GB`, async () => {
        const posts: unknown[] = [];
        const el = await setup(makeOrg(), recordPosts(posts));

        // @ts-expect-error customSizeGB is private
        el.customSizeGB = amount;
        // @ts-expect-error onCustomSubmit is private
        el.onCustomSubmit();
        // @ts-expect-error confirmChange is private
        await el.confirmChange();

        expect(posts).to.have.lengthOf(0);
      });
    }

    it("accepts a valid custom amount", async () => {
      const posts: unknown[] = [];
      const el = await setup(makeOrg(), recordPosts(posts));

      // @ts-expect-error customSizeGB is private
      el.customSizeGB = "1";
      // @ts-expect-error onCustomSubmit is private
      el.onCustomSubmit();
      // @ts-expect-error confirmChange is private
      await el.confirmChange();

      expect(posts).to.deep.equal([{ sizeGB: 1 }]);
    });
  });

  describe("polling until the org matches the change", () => {
    // The subscription service applies the change later, so the org data
    // stays out of date for a while after our request. These cases check
    // when the poll can stop: an increase changes the storage quota, a
    // reduction or cancellation changes only the pending size, and a keep
    // clears the pending size.
    const cases: {
      name: string;
      requestedGB: number;
      caughtUpOrg: OrgData;
      converged: boolean;
    }[] = [
      {
        name: "an increase",
        requestedGB: 300,
        caughtUpOrg: withAddon(300),
        converged: true,
      },
      {
        name: "an increase the service has not applied yet",
        requestedGB: 300,
        caughtUpOrg: withAddon(200),
        converged: false,
      },
      {
        name: "a reduction",
        requestedGB: 50,
        caughtUpOrg: withPending(50),
        converged: true,
      },
      {
        name: "a cancellation",
        requestedGB: 0,
        caughtUpOrg: withPending(0),
        converged: true,
      },
      {
        name: "a keep",
        requestedGB: 200,
        caughtUpOrg: withPending(null),
        converged: true,
      },
    ];

    for (const { name, requestedGB, caughtUpOrg, converged } of cases) {
      it(`${converged ? "stops" : "keeps"} polling after ${name}`, async () => {
        // start from 200 GB and let the poll see a different org
        const el = await setup(withAddon(200), async (path: string) =>
          path.includes("/subscription/storage-addon") ? {} : caughtUpOrg,
        );

        // @ts-expect-error updateAddon is private
        await el.updateAddon(requestedGB);
        // @ts-expect-error catchUpPoll is private
        await el.catchUpPoll.taskComplete;

        // @ts-expect-error catchUpPoll is private
        expect(el.catchUpPoll.paused).to.equal(converged);
      });
    }
  });
});
