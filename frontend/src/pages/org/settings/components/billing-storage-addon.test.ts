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

/** Text of the component's own (shadow) DOM */
const shadowText = (el: OrgSettingsBillingStorageAddon) =>
  (el.shadowRoot?.textContent ?? "").replace(/\s+/g, " ");

/** The confirmation dialog, or null when none is open */
const confirmDialog = (el: OrgSettingsBillingStorageAddon) =>
  el.shadowRoot?.querySelector("btrix-dialog") ?? null;

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

const withPending = (pendingGB: number | null): OrgData =>
  makeOrg({
    subscription: {
      ...makeOrg().subscription!,
      storageAddonPendingGB: pendingGB,
    },
  });

const withAddon = (sizeGB: number): OrgData =>
  makeOrg({
    quotas: {
      ...baseOrg.quotas,
      storageQuota: 500 * GB,
      extraStorageQuota: sizeGB * GB,
    },
  });

describe("btrix-org-settings-billing-storage-addon", () => {
  let el: OrgSettingsBillingStorageAddon | undefined;

  beforeEach(() => {
    // clear storage BEFORE seeding state: `settings` is persisted, and clearing
    // afterwards would drop what we just set
    window.localStorage.clear();
    window.sessionStorage.clear();
    AppStateService.resetAll();
    // Billing must be enabled or the tasks no-op and only the skeleton renders
    AppStateService.updateSettings(
      mockAPISettings as unknown as Parameters<
        typeof AppStateService.updateSettings
      >[0],
    );
    stub(window.history, "pushState");
  });

  afterEach(async () => {
    // PollTask reschedules itself with window.setTimeout, which would keep the
    // test session alive after the assertions finish. `stop()` pauses *and*
    // aborts, so no timer is left behind.
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
    AppStateService.updateOrg(org);
    await el.updateComplete;

    return el;
  };

  it("renders the add-on size from the org payload", async () => {
    const el = await setup(makeOrg());

    expect(shadowText(el)).to.include("200 GB");
    expect(shadowText(el)).not.to.include("None");
  });

  it("renders None when there is no add-on", async () => {
    const el = await setup(withAddon(0));

    expect(shadowText(el)).to.include("None");
  });

  it("does not call the removed storage-addon state endpoint", async () => {
    const paths: string[] = [];
    await setup(makeOrg(), async (path: string) => {
      paths.push(path);
      return {};
    });

    expect(paths.some((p) => p.includes("/subscription/storage-addon"))).to.be
      .false;
  });

  describe("pending state", () => {
    it("renders a scheduled reduction", async () => {
      const el = await setup(withPending(50));

      expect(shadowText(el)).to.include("reduces to 50 GB");
    });

    it("renders a scheduled cancellation", async () => {
      const el = await setup(withPending(0));

      expect(shadowText(el)).to.include("cancels at");
    });

    it("offers a Keep action that posts the current size", async () => {
      const posts: { path: string; body: unknown }[] = [];
      const el = await setup(
        withPending(0),
        async (path: string, options?: { body?: string }) => {
          if (path.includes("storage-addon")) {
            posts.push({
              path,
              body: options?.body ? JSON.parse(options.body) : undefined,
            });
            return { sizeGB: 200, pendingGB: null };
          }
          return makeOrg();
        },
      );

      expect(shadowText(el)).to.include("Keep 200 GB");

      // sl-button's click is retargeted inside the shadow root across a
      // component boundary, so drive the handler directly
      // @ts-expect-error updateAddon is private
      await el.updateAddon(200);

      expect(posts).to.have.lengthOf(1);
      expect(posts[0].body).to.deep.equal({ sizeGB: 200 });
    });
  });

  describe("usage gate", () => {
    it("shows a usage-gate toast and does not start polling", async () => {
      const el = await setup(makeOrg(), async (path: string) => {
        if (path.includes("storage-addon")) {
          throw new APIError({
            message: "below usage",
            status: 400,
            errorCode: APIErrorDetail.StorageAddonBelowUsage,
          });
        }
        return {};
      });

      const toastStub = stub(el.notify, "toast");

      // @ts-expect-error updateAddon is private
      await el.updateAddon(50).catch(() => {});

      expect(toastStub).to.have.been.calledOnce;
      expect(String(toastStub.firstCall.args[0].message)).to.include(
        "Free up storage",
      );

      // @ts-expect-error catchUpPoll is private
      expect(el.catchUpPoll.value).to.equal(undefined);
    });
  });

  describe("custom input validation", () => {
    it("rejects an out-of-bounds amount without posting", async () => {
      const posts: unknown[] = [];
      const el = await setup(makeOrg(), async (path: string) => {
        if (path.includes("storage-addon")) posts.push(path);
        return {};
      });

      // @ts-expect-error customSizeGB is private
      el.customSizeGB = "5001";
      // @ts-expect-error onCustomSubmit is private
      await el.onCustomSubmit();

      // @ts-expect-error customSizeGB is private
      el.customSizeGB = "0";
      // @ts-expect-error onCustomSubmit is private
      await el.onCustomSubmit();

      expect(posts).to.have.lengthOf(0);
    });

    it("asks for confirmation before applying an in-bounds amount", async () => {
      const posts: { body: unknown }[] = [];
      const el = await setup(
        makeOrg(),
        async (path: string, options?: { body?: string }) => {
          if (path.includes("storage-addon")) {
            posts.push({
              body: options?.body ? JSON.parse(options.body) : undefined,
            });
            return { sizeGB: 999, pendingGB: null };
          }
          return makeOrg();
        },
      );

      // @ts-expect-error customSizeGB is private
      el.customSizeGB = "999";
      // @ts-expect-error onCustomSubmit is private
      el.onCustomSubmit();
      await el.updateComplete;

      // nothing is sent to Stripe until the change is confirmed
      expect(posts).to.have.lengthOf(0);
      expect(confirmDialog(el)?.getAttribute("label")).to.equal(
        "Increase storage add-on?",
      );

      // @ts-expect-error confirmChange is private
      await el.confirmChange();

      expect(posts).to.have.lengthOf(1);
      expect(posts[0].body).to.deep.equal({ sizeGB: 999 });
      expect(confirmDialog(el)).to.equal(null);
    });
  });

  describe("confirmation", () => {
    it("does not change the add-on until the change is confirmed", async () => {
      const posts: unknown[] = [];
      const el = await setup(makeOrg(), async (path: string) => {
        if (path.includes("storage-addon")) posts.push(path);
        return {};
      });

      // @ts-expect-error requestChange is private
      el.requestChange(1000);
      await el.updateComplete;

      expect(posts).to.have.lengthOf(0);
      expect(confirmDialog(el)?.getAttribute("label")).to.equal(
        "Increase storage add-on?",
      );
    });

    it("says an increase is charged right away, with the recurring cost", async () => {
      const el = await setup(makeOrg(), async (path: string) => {
        if (path.includes("price/storage")) {
          return { value: 0.05, currency: "USD" };
        }
        return makeOrg();
      });
      // @ts-expect-error priceTask is private
      await el.priceTask.run();

      // @ts-expect-error requestChange is private
      el.requestChange(1000);
      await el.updateComplete;

      const text = shadowText(el);
      expect(text).to.include("charged a prorated amount now");
      expect(text).to.include("$50.00"); // 1000 GB at $0.05/GB
    });

    it("says a reduction takes effect at the next renewal", async () => {
      const el = await setup(withAddon(200), async (path: string) =>
        path.includes("price/storage")
          ? { value: 0.05, currency: "USD" }
          : makeOrg(),
      );
      // @ts-expect-error priceTask is private
      await el.priceTask.run();

      // @ts-expect-error requestChange is private
      el.requestChange(50);
      await el.updateComplete;

      expect(confirmDialog(el)?.getAttribute("label")).to.equal(
        "Reduce storage add-on?",
      );
      const text = shadowText(el);
      expect(text).to.include("At your next renewal on Jan 1, 2026");
      expect(text).to.include("Until then");
    });

    it("offers a way to cancel the add-on, dropping to the plan's storage", async () => {
      const posts: { body: unknown }[] = [];
      const el = await setup(
        makeOrg(),
        async (path: string, options?: { body?: string }) => {
          if (path.includes("storage-addon")) {
            posts.push({
              body: options?.body ? JSON.parse(options.body) : undefined,
            });
            return { sizeGB: 200, pendingGB: 0 };
          }
          return makeOrg();
        },
      );

      // the menu offers it at all, which it previously did not
      expect(shadowText(el)).to.include("Cancel add-on");

      // @ts-expect-error requestChange is private
      el.requestChange(0);
      await el.updateComplete;

      expect(posts).to.have.lengthOf(0);
      expect(confirmDialog(el)?.getAttribute("label")).to.equal(
        "Cancel storage add-on?",
      );
      expect(shadowText(el)).to.include("plan's 500 GB");

      // @ts-expect-error confirmChange is private
      await el.confirmChange();

      expect(posts).to.have.lengthOf(1);
      expect(posts[0].body).to.deep.equal({ sizeGB: 0 });
    });

    it("hides the cancel option once a cancellation is already pending", async () => {
      const el = await setup(withPending(0));

      expect(shadowText(el)).not.to.include("Cancel add-on");
    });

    it("applies a keep without a confirmation, since it only undoes a change", async () => {
      const posts: unknown[] = [];
      const el = await setup(withPending(0), async (path: string) => {
        if (path.includes("storage-addon")) {
          posts.push(path);
          return { sizeGB: 200, pendingGB: null };
        }
        return makeOrg();
      });

      // @ts-expect-error requestChange is private
      el.requestChange(200);
      await el.updateComplete;

      expect(posts).to.have.lengthOf(1);
      expect(confirmDialog(el)).to.equal(null);
    });
  });

  describe("polling until the org catches up", () => {
    it("refreshes the rendered state and stops polling once it has", async () => {
      const el = await setup(makeOrg(), async (path: string) => {
        if (path.includes("storage-addon")) {
          return { sizeGB: 300, pendingGB: null };
        }
        // the webhook has landed by the time we poll
        return withAddon(300);
      });

      // @ts-expect-error updateAddon is private
      await el.updateAddon(300);
      // @ts-expect-error catchUpPoll is private
      await el.catchUpPoll.taskComplete;

      await el.updateComplete;
      expect(shadowText(el)).to.include("300 GB");
      // @ts-expect-error catchUpPoll is private
      expect(el.catchUpPoll.paused).to.be.true;
    });

    it("stops polling a reduction once the pending value matches", async () => {
      // a reduction does not change the quota until the end of the billing
      // period, so we wait for the *pending* value, not the quota
      const el = await setup(withAddon(200), async (path: string) => {
        if (path.includes("storage-addon")) {
          return { sizeGB: 200, pendingGB: 50 };
        }
        return withPending(50);
      });

      // @ts-expect-error updateAddon is private
      await el.updateAddon(50);
      // @ts-expect-error catchUpPoll is private
      await el.catchUpPoll.taskComplete;

      // @ts-expect-error catchUpPoll is private
      expect(el.catchUpPoll.paused).to.be.true;
      await el.updateComplete;
      expect(shadowText(el)).to.include("reduces to 50 GB");
    });

    it("stops polling a cancellation once pending is zero", async () => {
      const el = await setup(withAddon(200), async (path: string) => {
        if (path.includes("storage-addon")) {
          return { sizeGB: 200, pendingGB: 0 };
        }
        return withPending(0);
      });

      // @ts-expect-error updateAddon is private
      await el.updateAddon(0);
      // @ts-expect-error catchUpPoll is private
      await el.catchUpPoll.taskComplete;

      // @ts-expect-error catchUpPoll is private
      expect(el.catchUpPoll.paused).to.be.true;
    });

    it("stops polling a keep once the pending change clears", async () => {
      // "keep" sends the size the org already has, so only the pending value
      // clearing can tell us the change has been applied
      const el = await setup(withPending(0), async (path: string) => {
        if (path.includes("storage-addon")) {
          return { sizeGB: 200, pendingGB: null };
        }
        return makeOrg();
      });

      // @ts-expect-error updateAddon is private
      await el.updateAddon(200);
      // @ts-expect-error catchUpPoll is private
      await el.catchUpPoll.taskComplete;

      // @ts-expect-error catchUpPoll is private
      expect(el.catchUpPoll.paused).to.be.true;
    });

    it("keeps polling while the org has not caught up", async () => {
      const el = await setup(makeOrg(), async (path: string) => {
        if (path.includes("storage-addon")) {
          return { sizeGB: 300, pendingGB: null };
        }
        // still the old size: the increase has not been applied yet
        return makeOrg();
      });

      // @ts-expect-error updateAddon is private
      await el.updateAddon(300);
      // @ts-expect-error catchUpPoll is private
      await el.catchUpPoll.taskComplete;

      // @ts-expect-error catchUpPoll is private
      expect(el.catchUpPoll.paused).to.be.false;
    });
  });
});
