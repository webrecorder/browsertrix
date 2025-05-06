import { localized, msg, str } from "@lit/localize";
import type {
  SlButton,
  SlChangeEvent,
  SlCheckbox,
  SlInput,
  SlMenuItem,
  SlRadioGroup,
} from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import Fuse from "fuse.js";
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { ClipboardController } from "@/controllers/clipboard";
import { SubscriptionStatus } from "@/types/billing";
import type { ProxiesAPIResponse, Proxy } from "@/types/crawler";
import type { OrgData } from "@/utils/orgs";

enum OrgFilter {
  All = "all",
  Active = "active",
  Inactive = "inactive",
  Trialing = "trialing",
  ScheduledCancel = "scheduled-cancel",
}

const none = html`
  <sl-icon
    name="slash"
    class="text-base text-neutral-400"
    label=${msg("None")}
  ></sl-icon>
`;

/**
 * @fires update-quotas
 * @fires update-proxies
 */
@customElement("btrix-orgs-list")
@localized()
export class OrgsList extends BtrixElement {
  static styles = css`
    btrix-table {
      --btrix-table-grid-template-columns: min-content [clickable-start]
        minmax(auto, 50ch) auto auto auto auto [clickable-end] min-content;
    }
  `;

  @property({ type: Array })
  orgList?: OrgData[] = [];

  @property({ type: Boolean })
  skeleton? = false;

  @property({ type: Object })
  currOrg?: OrgData | null = null;

  @state()
  private allProxies?: Proxy[];

  @query("#orgQuotaDialog")
  private readonly orgQuotaDialog?: Dialog | null;

  @query("#orgProxiesDialog")
  private readonly orgProxiesDialog?: Dialog | null;

  @query("#orgReadOnlyDialog")
  private readonly orgReadOnlyDialog?: Dialog | null;

  @query("#orgDeleteDialog")
  private readonly orgDeleteDialog?: Dialog | null;

  @query("#orgDeleteButton")
  private readonly orgDeleteButton?: SlButton | null;

  // For fuzzy search:
  private readonly fuse = new Fuse(this.orgList ?? [], {
    keys: [
      "id",
      "name",
      "slug",
      "users.name",
      "users.email",
      "subscription.subId",
      "subscription.planId",
    ],
    useExtendedSearch: true,
  });

  @state()
  private search = "";

  @state()
  private orgFilter: OrgFilter = OrgFilter.All;

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("orgList")) {
      this.fuse.setCollection(this.orgList ?? []);
    }
  }

  protected firstUpdated() {
    this.fuse.setCollection(this.orgList ?? []);
  }

  render() {
    if (this.skeleton) {
      return this.renderSkeleton();
    }

    const searchResults = this.search
      ? this.fuse.search(this.search).map(({ item }) => item)
      : this.orgList;

    const orgs = searchResults?.filter((org) =>
      this.filterOrg(org, this.orgFilter),
    );

    return html`
      <sl-input
        value=${this.search}
        clearable
        size="small"
        class="mb-4"
        placeholder=${msg(
          "Search all orgs by name, id, slug, users, and subscriptions",
        )}
        @sl-input=${(e: Event) => {
          this.search = (e.target as SlInput).value.trim() || "";
        }}
      >
        <sl-icon
          name="search"
          slot="prefix"
          aria-hidden="true"
          library="default"
        ></sl-icon
      ></sl-input>
      <btrix-overflow-scroll
        class="-mx-3 [--btrix-overflow-scroll-scrim-color:theme(colors.neutral.50)] part-[content]:px-3"
      >
        <sl-radio-group
          size="small"
          value=${this.orgFilter}
          class="mb-6 flex min-w-min justify-end"
          @sl-change=${(e: SlChangeEvent) => {
            this.orgFilter = (e.target as SlRadioGroup).value as OrgFilter;
          }}
        >
          ${[
            { label: msg("All"), icon: "asterisk", filter: OrgFilter.All },
            {
              label: msg("Active"),
              icon: "credit-card",
              filter: OrgFilter.Active,
            },
            {
              label: msg("Inactive"),
              icon: "x-square",
              filter: OrgFilter.Inactive,
            },
            {
              label: msg("Trials"),
              icon: "basket",
              filter: OrgFilter.Trialing,
            },
            {
              label: msg("Cancellation Scheduled"),
              icon: "calendar2-x",
              filter: OrgFilter.ScheduledCancel,
            },
          ].map((options) => this.renderFilterButton(searchResults, options))}
        </sl-radio-group>
      </btrix-overflow-scroll>
      <btrix-overflow-scroll
        class="-mx-3 [--btrix-overflow-scroll-scrim-color:theme(colors.neutral.50)] part-[content]:px-3"
      >
        <btrix-table>
          <btrix-table-head class="mb-2">
            <btrix-table-header-cell>
              <span class="sr-only">${msg("Status")}</span>
            </btrix-table-header-cell>
            <btrix-table-header-cell class="px-2">
              ${msg("Name")}
            </btrix-table-header-cell>
            <btrix-table-header-cell class="px-2">
              ${msg("Created")}
            </btrix-table-header-cell>
            <btrix-table-header-cell class="px-2">
              ${msg("Members")}
            </btrix-table-header-cell>
            <btrix-table-header-cell class="px-2">
              ${msg("Bytes Stored")}
            </btrix-table-header-cell>
            <btrix-table-header-cell class="px-2">
              ${msg("Last Crawl")}
            </btrix-table-header-cell>
            <btrix-table-header-cell>
              <span class="sr-only">${msg("Actions")}</span>
            </btrix-table-header-cell>
          </btrix-table-head>
          <btrix-table-body class="rounded border">
            ${repeat(orgs || [], (org) => org.id, this.renderOrg)}
          </btrix-table-body>
        </btrix-table>
      </btrix-overflow-scroll>

      ${this.renderOrgQuotas()} ${this.renderOrgProxies()}
      ${this.renderOrgReadOnly()} ${this.renderOrgDelete()}
    `;
  }

  private renderFilterButton(
    orgs: OrgData[] | undefined,
    options: { label: string; icon: string; filter: OrgFilter },
  ) {
    const { label, icon, filter } = options;
    return (
      this.orgList?.some((org) => this.filterOrg(org, filter)) &&
      html`
        <sl-radio-button
          pill
          value=${filter}
          class="part-[label]:items-baseline"
        >
          <sl-icon name=${icon} slot="prefix"></sl-icon>
          ${label}
          <span class="ml-2 text-xs font-normal tabular-nums"
            >${this.localize.number(
              orgs?.filter((org) => this.filterOrg(org, filter)).length ?? 0,
            )}</span
          >
        </sl-radio-button>
      `
    );
  }

  private filterOrg(org: OrgData, filter: OrgFilter): boolean {
    switch (filter) {
      case OrgFilter.Active:
        return (
          !!org.subscription &&
          org.subscription.status === SubscriptionStatus.Active
        );
      case OrgFilter.Inactive:
        return (
          !!org.subscription &&
          !(
            org.subscription.status === SubscriptionStatus.Active ||
            org.subscription.status === SubscriptionStatus.Trialing
          )
        );
      case OrgFilter.Trialing:
        return (
          !!org.subscription &&
          org.subscription.status === SubscriptionStatus.Trialing
        );
      case OrgFilter.ScheduledCancel:
        return (
          !!org.subscription &&
          org.subscription.status === SubscriptionStatus.Active &&
          !!org.subscription.futureCancelDate
        );
      case OrgFilter.All:
        return true;
    }
  }

  private renderOrgQuotas() {
    return html`
      <btrix-dialog
        id="orgQuotaDialog"
        .label=${msg(str`Quotas for: ${this.currOrg?.name || ""}`)}
        @sl-after-hide=${() => (this.currOrg = null)}
      >
        ${when(this.currOrg?.quotas, (quotas) =>
          Object.entries(quotas).map(([key, value]) => {
            let label;
            switch (key) {
              case "maxConcurrentCrawls":
                label = msg("Max Concurrent Crawls");
                break;
              case "maxPagesPerCrawl":
                label = msg("Max Pages Per Crawl");
                break;
              case "storageQuota":
                label = msg("Org Storage Quota (GB)");
                value = Math.floor(value / 1e9);
                break;
              case "maxExecMinutesPerMonth":
                label = msg("Max Execution Minutes Per Month");
                break;
              case "extraExecMinutes":
                label = msg("Extra Execution Minutes");
                break;
              case "giftedExecMinutes":
                label = msg("Gifted Execution Minutes");
                break;
              default:
                label = msg("Unlabeled");
            }
            return html` <sl-input
              class="mb-3 last:mb-0"
              name=${key}
              label=${label}
              value=${value}
              type="number"
              @sl-input="${this.onUpdateQuota}"
            ></sl-input>`;
          }),
        )}
        <div slot="footer" class="flex justify-end">
          <sl-button
            size="small"
            @click="${this.onSubmitQuotas}"
            variant="primary"
            >${msg("Update Quotas")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private renderOrgProxies() {
    return html`
      <btrix-dialog
        id="orgProxiesDialog"
        .label=${msg(str`Proxy Settings for: ${this.currOrg?.name || ""}`)}
        @sl-after-hide=${() => (this.currOrg = null)}
        @sl-show=${() => {
          void this.fetchAllProxies();
        }}
      >
        <sl-checkbox
          class="mb-3 last:mb-0"
          name="allowSharedProxies"
          ?checked=${this.currOrg?.allowSharedProxies}
          @sl-input="${this.onUpdateAllowSharedProxies}"
          >${msg("Enable all shared proxies")}</sl-checkbox
        >

        <sl-menu @sl-select="${this.onUpdateAllowedProxies}">
          <sl-menu-label>Enable selected shared proxies</sl-menu-label>
          ${this.allProxies
            ?.filter((server) => server.shared)
            .map(
              (server) =>
                html` <sl-menu-item
                  type="checkbox"
                  value=${server.id}
                  ?checked=${this.currOrg?.allowedProxies.indexOf(server.id) !=
                  -1}
                >
                  <code>${server.id}</code>: ${server.label}
                </sl-menu-item>`,
            )}
          <sl-divider></sl-divider>
          <sl-menu-label>Enable selected private proxies</sl-menu-label>

          ${this.allProxies
            ?.filter((server) => !server.shared)
            .map(
              (server) =>
                html` <sl-menu-item
                  type="checkbox"
                  value=${server.id}
                  ?checked=${this.currOrg?.allowedProxies.indexOf(server.id) !=
                  -1}
                >
                  <code>${server.id}</code>: ${server.label}
                </sl-menu-item>`,
            )}
        </sl-menu>

        <div slot="footer" class="flex justify-end">
          <sl-button
            size="small"
            @click="${this.onSubmitProxies}"
            variant="primary"
            >${msg("Update Proxy Settings")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private renderOrgReadOnly() {
    return html`
      <btrix-dialog
        class="[--width:36rem]"
        id="orgReadOnlyDialog"
        .label=${msg(str`Disable Archiving?`)}
        @sl-after-hide=${() => (this.currOrg = null)}
      >
        ${when(this.currOrg, (org) => {
          return html`
            <p class="mb-3">
              ${msg(
                html`Are you sure you want to disable archiving in
                  <strong class="font-semibold">${org.name}</strong> org?
                  Members will no longer be able to crawl, upload files, create
                  browser profiles, or create collections.`,
              )}
            </p>
            <ul class="mb-3 text-neutral-600">
              <li>
                ${msg("Slug:")}
                <a
                  class="font-semibold text-primary hover:text-primary-500"
                  href="/orgs/${org.slug}"
                  target="_blank"
                >
                  ${org.slug}
                </a>
              </li>
              <li>
                ${msg("Members:")}
                <a
                  class="font-semibold text-primary hover:text-primary-500"
                  href="/orgs/${org.slug}/settings/members"
                  target="_blank"
                >
                  ${this.localize.number(Object.keys(org.users || {}).length)}
                </a>
              </li>
            </ul>
            <form @submit=${this.onSubmitReadOnly}>
              <sl-input
                name="readOnlyReason"
                label=${msg("Reason")}
                placeholder=${msg("Enter reason for disabling archiving")}
                required
              ></sl-input>
            </form>

            <div slot="footer" class="flex justify-end">
              <sl-button
                size="small"
                @click=${this.orgReadOnlyDialog?.submit}
                variant="primary"
              >
                ${msg("Disable Archiving")}
              </sl-button>
            </div>
          `;
        })}
      </btrix-dialog>
    `;
  }

  private renderOrgDelete() {
    return html`
      <btrix-dialog
        class="[--width:36rem]"
        id="orgDeleteDialog"
        .label=${msg(str`Confirm Org Deletion: ${this.currOrg?.name || ""}`)}
        @sl-after-hide=${() => (this.currOrg = null)}
      >
        ${when(this.currOrg, (org) => {
          const confirmationStr = msg(str`Delete ${org.name}`);
          return html`
            <p class="mb-3">
              ${msg(
                html`Are you sure you want to delete
                  <strong class="font-semibold">${org.name}</strong>? This
                  cannot be undone.`,
              )}
            </p>
            <ul class="mb-3 text-neutral-600">
              <li>
                ${msg(str`Slug:`)}
                <a
                  class="font-semibold text-primary hover:text-primary-500"
                  href="/orgs/${org.slug}"
                  target="_blank"
                >
                  ${org.slug}
                </a>
              </li>
              <li>
                ${msg("Members:")}
                <a
                  class="font-semibold text-primary hover:text-primary-500"
                  href="/orgs/${org.slug}/settings/members"
                  target="_blank"
                >
                  ${this.localize.number(Object.keys(org.users || {}).length)}
                </a>
              </li>
            </ul>
            <p class="mb-3">
              ${msg(
                html`Deleting an org will delete all
                  <strong class="font-semibold">
                    ${this.localize.bytes(org.bytesStored)}
                  </strong>
                  of data associated with the org.`,
              )}
            </p>
            <ul class="mb-3 text-neutral-600">
              <li>
                ${msg(
                  str`Crawls: ${this.localize.bytes(org.bytesStoredCrawls)}`,
                )}
              </li>
              <li>
                ${msg(
                  str`Uploads: ${this.localize.bytes(org.bytesStoredUploads)}`,
                )}
              </li>
              <li>
                ${msg(
                  str`Profiles: ${this.localize.bytes(org.bytesStoredProfiles)}`,
                )}
              </li>
            </ul>
            <sl-divider></sl-divider>
            <sl-input
              placeholder=${confirmationStr}
              @sl-input=${(e: SlChangeEvent) => {
                const { value } = e.target as SlInput;
                this.orgDeleteButton!.disabled = value !== confirmationStr;
              }}
            >
              <strong slot="label" class="font-semibold">
                ${msg(str`Type "${confirmationStr}" to confirm`)}
              </strong>
            </sl-input>
            <div slot="footer" class="flex justify-between">
              <sl-button
                size="small"
                @click=${() => void this.orgDeleteDialog?.hide()}
              >
                ${msg("Cancel")}
              </sl-button>
              <sl-button
                id="orgDeleteButton"
                size="small"
                variant="danger"
                disabled
                @click=${async () => {
                  await this.deleteOrg(org);
                  void this.orgDeleteDialog?.hide();
                }}
              >
                ${msg("Delete Org")}
              </sl-button>
            </div>
          `;
        })}
      </btrix-dialog>
    `;
  }

  private onUpdateQuota(e: CustomEvent) {
    const inputEl = e.target as SlInput;
    const name = inputEl.name as keyof OrgData["quotas"];
    const quotas = this.currOrg?.quotas;
    if (quotas) {
      if (name === "storageQuota") {
        quotas[name] = Number(inputEl.value) * 1e9;
      } else {
        quotas[name] = Number(inputEl.value);
      }
    }
  }

  private onUpdateAllowSharedProxies(e: CustomEvent) {
    const inputEl = e.target as SlCheckbox;
    if (this.currOrg) {
      this.currOrg.allowSharedProxies = inputEl.checked;
    }
  }

  private onUpdateAllowedProxies(e: CustomEvent) {
    const inputEl = e.detail.item as SlMenuItem;
    if (this.currOrg && inputEl.type === "checkbox") {
      const proxyId = inputEl.value;
      const proxyIndex = this.currOrg.allowedProxies.indexOf(proxyId);
      const hasProxy = proxyIndex != -1;
      if (inputEl.checked) {
        if (!hasProxy) this.currOrg.allowedProxies.push(proxyId);
      } else if (hasProxy) {
        this.currOrg.allowedProxies.splice(proxyIndex, 1);
      }
    }
  }

  private onSubmitQuotas() {
    if (this.currOrg) {
      this.dispatchEvent(
        new CustomEvent("update-quotas", { detail: this.currOrg }),
      );

      void this.orgQuotaDialog?.hide();
    }
  }

  private onSubmitProxies() {
    if (this.currOrg) {
      this.dispatchEvent(
        new CustomEvent("update-proxies", { detail: this.currOrg }),
      );

      void this.orgProxiesDialog?.hide();
    }
  }

  private async onSubmitReadOnly(e: SubmitEvent) {
    e.preventDefault();

    if (!this.currOrg) return;

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const { readOnlyReason } = serialize(formEl) as { readOnlyReason: string };

    await this.updateReadOnly(this.currOrg, {
      readOnly: true,
      readOnlyReason: readOnlyReason,
    });

    void this.orgReadOnlyDialog?.hide();
  }

  private async updateReadOnly(
    org: OrgData,
    params: Pick<OrgData, "readOnly" | "readOnlyReason">,
  ) {
    try {
      await this.api.fetch(`/orgs/${org.id}/read-only`, {
        method: "POST",
        body: JSON.stringify(params),
      });

      this.orgList = this.orgList?.map((o) => {
        if (o.id === org.id) {
          return {
            ...o,
            ...params,
          };
        }
        return o;
      });

      this.notify.toast({
        message: params.readOnly
          ? msg(str`Archiving in "${org.name}" is disabled.`)
          : msg(str`Archiving in "${org.name}" is re-enabled.`),
        variant: "success",
        icon: "check2-circle",
        id: "archiving-enabled-status",
      });
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg(
          "Sorry, couldn't update org archiving ability at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archiving-ability-status",
      });
    }
  }

  private async fetchAllProxies() {
    try {
      const data = await this.api.fetch<ProxiesAPIResponse>(
        `/orgs/all/crawlconfigs/crawler-proxies`,
      );
      this.allProxies = data.servers;
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't get all proxies at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "proxy-retrieve-status",
      });
    }
  }
  private async deleteOrg(org: OrgData) {
    try {
      await this.api.fetch(`/orgs/${org.id}`, {
        method: "DELETE",
      });

      this.orgList = this.orgList?.filter((o) => o.id !== org.id);

      this.notify.toast({
        message: msg(str`Org "${org.name}" has been deleted.`),
        variant: "success",
        icon: "check2-circle",
        id: "org-delete-status",
      });
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't delete org at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "org-delete-status",
      });
    }
  }

  private readonly renderOrg = (org: OrgData) => {
    if (!this.userInfo) return;

    // There shouldn't really be a case where an org is in the org list but
    // not in user info, but disable clicking into the org just in case
    const isUserOrg = this.userInfo.orgs.some(({ id }) => id === org.id);

    const memberCount = Object.keys(org.users || {}).length;

    let status = {
      icon: html`<sl-icon
        class="text-base text-success"
        name="check-circle-fill"
        label=${msg("Good")}
      ></sl-icon>`,
      description: msg("Active"),
    };

    if (org.storageQuotaReached || org.execMinutesQuotaReached) {
      status = {
        icon: html`<sl-icon
          class="text-base text-danger"
          name="exclamation-triangle-fill"
          label=${msg("Issue")}
        >
        </sl-icon>`,
        description: org.storageQuotaReached
          ? msg("Active with issue: Storage quota reached")
          : msg("Active with issue: Execution minutes quota reached"),
      };
    }

    if (org.readOnly) {
      status = {
        icon: html`<sl-icon
          class="text-base text-neutral-400"
          name="ban"
          label=${msg("disabled")}
        >
        </sl-icon>`,
        description: org.readOnlyReason
          ? `${msg("Archiving Disabled:")} ${org.readOnlyReason}`
          : msg("Archiving Disabled (no reason specified)"),
      };
    }

    let subscription: {
      icon: TemplateResult<1>;
      description: string | TemplateResult<1>;
    } = {
      icon: none,
      description: msg("No Subscription"),
    };

    if (org.subscription) {
      switch (org.subscription.status) {
        case SubscriptionStatus.Active:
          if (org.subscription.futureCancelDate) {
            subscription = {
              icon: html`<sl-icon
                class="text-base text-warning"
                name="calendar2-x"
                label=${msg("Subscription Cancellation Scheduled")}
              ></sl-icon>`,
              description: html`${msg("Subscription Cancellation Scheduled")}
                <div class="mt-2 text-xs">
                  ${msg("Subscription will be cancelled in")}
                  ${this.localize.humanizeDuration(
                    new Date(org.subscription.futureCancelDate).getTime() -
                      new Date().getTime(),
                  )}
                  (${this.localize.date(org.subscription.futureCancelDate, {
                    timeStyle: "medium",
                    dateStyle: "medium",
                  })})
                </div>`,
            };
          } else {
            subscription = {
              icon: html`<sl-icon
                class="text-base text-success"
                name="credit-card-fill"
                label=${msg("Active Subscription")}
              ></sl-icon>`,
              description: msg("Active Subscription"),
            };
          }
          break;
        case SubscriptionStatus.Trialing:
          subscription = {
            icon: html`<sl-icon
              class="text-base text-neutral-400"
              name="basket-fill"
              label=${msg("Trial")}
            ></sl-icon>`,
            description: msg("Trial"),
          };
          break;
        case SubscriptionStatus.TrialingCanceled:
          subscription = {
            icon: html`<sl-icon
              class="text-base text-neutral-400"
              name="x-square-fill"
              label=${msg("Trial Cancelled")}
            ></sl-icon>`,
            description: msg("Trial Canceled"),
          };
          break;
        case SubscriptionStatus.PausedPaymentFailed:
          subscription = {
            icon: html`<sl-icon
              class="text-base text-danger"
              name="exclamation-triangle-fill"
              label=${msg("Payment Failed")}
            ></sl-icon>`,
            description: msg("Payment Failed"),
          };
          break;
        case SubscriptionStatus.Cancelled:
          subscription = {
            icon: html`<sl-icon
              class="text-base text-neutral-400"
              name="x-square-fill"
              label=${msg("Canceled")}
            >
            </sl-icon>`,
            description: msg("Canceled"),
          };
          break;
        case SubscriptionStatus.PaymentNeverMade:
          subscription = {
            icon: html`<sl-icon
              class="text-base text-neutral-400"
              name="dash-square-fill"
              label=${msg("Payment Never Made")}
            >
            </sl-icon>`,
            description: msg("Payment Never Made"),
          };
          break;
        default:
          break;
      }
    }

    return html`
      <btrix-table-row
        class="${isUserOrg
          ? ""
          : "opacity-50"} cursor-pointer select-none border-b bg-neutral-0 transition-colors first-of-type:rounded-t last-of-type:rounded-b last-of-type:border-none focus-within:bg-neutral-50 hover:bg-neutral-50"
      >
        <btrix-table-cell class="min-w-6 gap-1 pl-2">
          <sl-tooltip content=${status.description} hoist>
            ${status.icon}
          </sl-tooltip>
          <sl-tooltip hoist>
            <span slot="content">${subscription.description}</span>
            ${subscription.icon}
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell class="p-2" rowClickTarget="a">
          <a
            class=${org.readOnly ? "text-neutral-500" : "text-neutral-900"}
            href="/orgs/${org.slug}/dashboard"
            @click=${this.navigate.link}
            aria-disabled="${!isUserOrg}"
          >
            ${org.default
              ? html`<btrix-tag class="mr-1">${msg("Default")}</btrix-tag>`
              : nothing}
            ${org.name === org.id
              ? html`<code class="text-neutral-400">${org.id}</code>`
              : org.name}
          </a>
        </btrix-table-cell>
        <btrix-table-cell class="p-2">
          ${org.created
            ? html` <btrix-format-date
                date=${org.created}
                month="2-digit"
                day="2-digit"
                year="numeric"
              ></btrix-format-date>`
            : none}
        </btrix-table-cell>
        <btrix-table-cell class="p-2">
          ${memberCount ? this.localize.number(memberCount) : none}
        </btrix-table-cell>
        <btrix-table-cell class="p-2">
          ${org.bytesStored
            ? this.localize.bytes(org.bytesStored, { unitDisplay: "narrow" })
            : none}
        </btrix-table-cell>
        <btrix-table-cell class="p-2">
          ${org.lastCrawlFinished
            ? html`<btrix-format-date
                date=${org.lastCrawlFinished}
                month="2-digit"
                day="2-digit"
                year="numeric"
              ></btrix-format-date>`
            : none}
        </btrix-table-cell>
        <btrix-table-cell class="p-1">
          <btrix-overflow-dropdown
            @click=${(e: MouseEvent) => e.stopPropagation()}
          >
            <sl-menu>
              <sl-menu-label>${msg("Subscription")}</sl-menu-label>
              ${org.subscription
                ? html`
                    ${org.subscription.subId.startsWith("stripe:")
                      ? html`<sl-menu-item
                          @click=${() => {
                            window.open(
                              `https://dashboard.stripe.com/subscriptions/${org.subscription!.subId.slice(7)}`,
                              "_blank",
                            );
                          }}
                        >
                          <sl-icon slot="prefix" name="stripe"></sl-icon>
                          ${msg("Open in Stripe")}
                          <sl-icon
                            slot="suffix"
                            name="box-arrow-up-right"
                          ></sl-icon>
                        </sl-menu-item>`
                      : html`<sl-menu-item
                          @click=${() => {
                            ClipboardController.copyToClipboard(
                              org.subscription!.subId,
                            );
                            this.notify.toast({
                              message: msg("Subscription ID Copied"),
                              duration: 1000,
                              variant: "success",
                              id: "item-copied",
                            });
                          }}
                        >
                          ${msg("Copy Subscription ID")}
                        </sl-menu-item>`}
                    <sl-menu-item disabled>
                      ${msg("Plan ID")}
                      <span class="font-monospace" slot="suffix"
                        >${org.subscription.planId}</span
                      >
                    </sl-menu-item>
                    <sl-menu-item disabled>
                      ${msg("Action on Cancel")}
                      <span class="font-bold" slot="suffix"
                        >${org.subscription.readOnlyOnCancel
                          ? msg("Read-Only")
                          : msg("Delete")}</span
                      >
                    </sl-menu-item>
                  `
                : html`<sl-menu-item disabled>
                    <sl-icon
                      name="slash"
                      class="text-base text-neutral-400"
                      slot="prefix"
                    ></sl-icon>
                    ${msg("No Subscription")}</sl-menu-item
                  >`}
              <sl-divider></sl-divider>
              <sl-menu-label>${msg("Manage Org")}</sl-menu-label>
              <sl-menu-item
                @click=${() => {
                  this.currOrg = org;
                  void this.orgQuotaDialog?.show();
                }}
              >
                <sl-icon slot="prefix" name="gear"></sl-icon>
                ${msg("Edit Quotas")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() => {
                  this.currOrg = org;
                  void this.orgProxiesDialog?.show();
                }}
              >
                <sl-icon slot="prefix" name="globe2"></sl-icon>
                ${msg("Edit Proxies")}
              </sl-menu-item>
              ${org.readOnly
                ? html`
                    <sl-menu-item
                      @click=${() => {
                        void this.updateReadOnly(org, {
                          readOnly: false,
                          readOnlyReason: "",
                        });
                      }}
                    >
                      <sl-icon
                        slot="prefix"
                        name="arrow-counterclockwise"
                      ></sl-icon>
                      ${msg("Re-enable Archiving")}
                    </sl-menu-item>
                  `
                : html`
                    <sl-menu-item
                      @click=${() => {
                        this.currOrg = org;
                        void this.orgReadOnlyDialog?.show();
                      }}
                    >
                      <sl-icon slot="prefix" name="ban"></sl-icon>
                      ${msg("Disable Archiving")}
                    </sl-menu-item>
                  `}
              <sl-divider></sl-divider>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => {
                  this.currOrg = org;
                  void this.orgDeleteDialog?.show();
                }}
              >
                <sl-icon slot="prefix" name="trash3"></sl-icon>
                ${msg("Delete Org")}
              </sl-menu-item>
            </sl-menu>
          </btrix-overflow-dropdown>
        </btrix-table-cell>
      </btrix-table-row>
    `;
  };

  private renderSkeleton() {
    return html`
      <div class="overflow-hidden rounded-lg border">
        <div class="border-t bg-white p-3 text-primary first:border-t-0 md:p-6">
          <sl-skeleton class="h-6 w-80"></sl-skeleton>
        </div>
      </div>
    `;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
