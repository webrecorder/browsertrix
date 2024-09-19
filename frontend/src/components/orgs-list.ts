import { localized, msg, str } from "@lit/localize";
import type {
  SlButton,
  SlChangeEvent,
  SlInput,
} from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { css, html, nothing } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { formatNumber, getLocale } from "@/utils/localization";
import type { OrgData } from "@/utils/orgs";

/**
 * @fires update-quotas
 */
@localized()
@customElement("btrix-orgs-list")
export class OrgsList extends BtrixElement {
  static styles = css`
    btrix-table {
      grid-template-columns: min-content [clickable-start] 50ch auto auto auto [clickable-end] min-content;
    }
  `;

  @property({ type: Array })
  orgList?: OrgData[] = [];

  @property({ type: Boolean })
  skeleton? = false;

  @property({ type: Object })
  currOrg?: OrgData | null = null;

  @query("#orgQuotaDialog")
  private readonly orgQuotaDialog?: Dialog | null;

  @query("#orgReadOnlyDialog")
  private readonly orgReadOnlyDialog?: Dialog | null;

  @query("#orgDeleteDialog")
  private readonly orgDeleteDialog?: Dialog | null;

  @query("#orgDeleteButton")
  private readonly orgDeleteButton?: SlButton | null;

  render() {
    if (this.skeleton) {
      return this.renderSkeleton();
    }

    return html`
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
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body class="rounded border">
          ${this.orgList?.map(this.renderOrg)}
        </btrix-table-body>
      </btrix-table>

      ${this.renderOrgQuotas()} ${this.renderOrgReadOnly()}
      ${this.renderOrgDelete()}
    `;
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
                  ${formatNumber(Object.keys(org.users || {}).length)}
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
                  ${formatNumber(Object.keys(org.users || {}).length)}
                </a>
              </li>
            </ul>
            <p class="mb-3">
              ${msg(
                html`Deleting an org will delete all
                  <strong class="font-semibold">
                    <sl-format-bytes value=${org.bytesStored}></sl-format-bytes>
                  </strong>
                  of data associated with the org.`,
              )}
            </p>
            <ul class="mb-3 text-neutral-600">
              <li>
                ${msg(
                  html`Crawls:
                    <sl-format-bytes
                      value=${org.bytesStoredCrawls}
                    ></sl-format-bytes>`,
                )}
              </li>
              <li>
                ${msg(
                  html`Uploads:
                    <sl-format-bytes
                      value=${org.bytesStoredUploads}
                    ></sl-format-bytes>`,
                )}
              </li>
              <li>
                ${msg(
                  html`Profiles:
                    <sl-format-bytes
                      value=${org.bytesStoredProfiles}
                    ></sl-format-bytes>`,
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

  private onSubmitQuotas() {
    if (this.currOrg) {
      this.dispatchEvent(
        new CustomEvent("update-quotas", { detail: this.currOrg }),
      );

      void this.orgQuotaDialog?.hide();
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
      });
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg(
          "Sorry, couldn't update org archiving ability at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
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
      });
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't delete org at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private readonly renderOrg = (org: OrgData) => {
    if (!this.userInfo) return;

    // There shouldn't really be a case where an org is in the org list but
    // not in user info, but disable clicking into the org just in case
    const isUserOrg = this.userInfo.orgs.some(({ id }) => id === org.id);

    const memberCount = Object.keys(org.users || {}).length;

    const none = html`
      <sl-icon
        name="slash"
        class="text-base text-neutral-400"
        label=${msg("None")}
      ></sl-icon>
    `;

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

    return html`
      <btrix-table-row
        class="${isUserOrg
          ? ""
          : "opacity-50"} cursor-pointer select-none border-b bg-neutral-0 transition-colors first-of-type:rounded-t last-of-type:rounded-b last-of-type:border-none focus-within:bg-neutral-50 hover:bg-neutral-50"
      >
        <btrix-table-cell class="min-w-6 pl-2">
          <sl-tooltip content=${status.description}>
            ${status.icon}
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell class="p-2" rowClickTarget="a">
          <a
            class=${org.readOnly ? "text-neutral-500" : "text-neutral-900"}
            href="/orgs/${org.slug}"
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
          <sl-format-date
            lang=${getLocale()}
            class="truncate"
            date=${org.created}
            month="2-digit"
            day="2-digit"
            year="2-digit"
          ></sl-format-date>
        </btrix-table-cell>
        <btrix-table-cell class="p-2">
          ${memberCount ? formatNumber(memberCount) : none}
        </btrix-table-cell>
        <btrix-table-cell class="p-2">
          ${org.bytesStored
            ? html`<sl-format-bytes
                value=${org.bytesStored}
                display="narrow"
              ></sl-format-bytes>`
            : none}
        </btrix-table-cell>
        <btrix-table-cell class="p-1">
          <btrix-overflow-dropdown
            @click=${(e: MouseEvent) => e.stopPropagation()}
          >
            <sl-menu>
              <sl-menu-item
                @click=${() => {
                  this.currOrg = org;
                  void this.orgQuotaDialog?.show();
                }}
              >
                <sl-icon slot="prefix" name="gear"></sl-icon>
                ${msg("Edit Quotas")}
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
