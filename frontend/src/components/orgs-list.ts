import { localized, msg, str } from "@lit/localize";
import type { SlChangeEvent, SlInput } from "@shoelace-style/shoelace";
import { html, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import type { CurrentUser, UserOrg } from "@/types/user";
import type { OrgData } from "@/utils/orgs";

@localized()
@customElement("btrix-orgs-list")
export class OrgsList extends TailwindElement {
  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Array })
  orgList?: OrgData[] = [];

  @property({ type: Boolean })
  skeleton? = false;

  @property({ type: Object })
  currOrg?: OrgData | null = null;

  @state()
  enableDeleteButton = false;

  @query("#orgDeleteDialog")
  orgDeleteDialog?: Dialog | null;

  @query("#orgQuotaDialog")
  orgQuotaDialog?: Dialog | null;

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);

  render() {
    if (this.skeleton) {
      return this.renderSkeleton();
    }

    const defaultOrg = this.userInfo?.orgs.find((org) => org.default === true);

    return html`
      <ul class="overflow-hidden rounded-lg border">
        ${this.orgList?.map(this.renderOrg(defaultOrg))}
        ${this.renderOrgDelete()}
        ${this.renderOrgQuotas()}
      </ul>
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
                  <a
                    class="font-semibold text-primary"
                    href="/orgs/${org.slug}"
                    target="_blank"
                  >
                    ${org.name}
                    <sl-icon
                      name="box-arrow-up-right"
                      label=${msg("Open in new window")}
                    ></sl-icon> </a
                  >? This cannot be undone.`,
              )}
            </p>
            <ul class="mb-3 text-neutral-600">
              <li>${msg(str`Slug: ${org.slug}`)}</li>
              <li>
                ${msg(
                  str`Members: ${Object.keys(org.users || {}).length.toLocaleString()}`,
                )}
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
                this.enableDeleteButton = value === confirmationStr;
              }}
            >
              <strong slot="label" class="font-semibold">
                ${msg(str`Type "${confirmationStr}" to confirm`)}
              </strong>
            </sl-input>
          `;
        })}
        <div slot="footer" class="flex justify-end">
          <sl-button
            size="small"
            @click=${() => {
              console.log("TODO");
            }}
            variant="danger"
            ?disabled=${!this.enableDeleteButton}
          >
            ${msg("Delete Org")}
          </sl-button>
        </div>
      </btrix-dialog>
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

  private onUpdateQuota(e: CustomEvent) {
    const inputEl = e.target as SlInput;
    const quotas = this.currOrg?.quotas;
    if (quotas) {
      if (inputEl.name === "storageQuota") {
        quotas[inputEl.name] = Number(inputEl.value) * 1e9;
      } else {
        quotas[inputEl.name] = Number(inputEl.value);
      }
    }
  }

  private onSubmitQuotas() {
    if (this.currOrg) {
      this.dispatchEvent(
        new CustomEvent("update-quotas", { detail: this.currOrg }),
      );
    }
  }

  private readonly renderOrg = (defaultOrg?: UserOrg) => (org: OrgData) => {
    if (!this.userInfo) return;

    // There shouldn't really be a case where an org is in the org list but
    // not in user info, but disable clicking into the org just in case
    const isUserOrg = this.userInfo.orgs.some(({ id }) => id === org.id);

    let defaultLabel: TemplateResult | undefined;

    if (defaultOrg && org.id === defaultOrg.id) {
      defaultLabel = html`<sl-tag size="small" variant="primary" class="mr-2"
        >${msg("Default")}</sl-tag
      >`;
    }
    const memberCount = Object.keys(org.users || {}).length;

    return html`
      <li
        class="${isUserOrg
          ? ""
          : "select-none cursor-not-allowed opacity-50"} flex items-center justify-between border-t bg-white p-3 text-primary first:border-t-0 hover:text-indigo-400"
        role="button"
        @click=${this.makeOnOrgClick(org)}
        aria-disabled="${isUserOrg}"
      >
        <div class="mr-2 font-medium transition-colors">
          ${defaultLabel}${org.name}
        </div>
        <div class="flex flex-row items-center">
          <div class="text-s font-monostyle mr-4 text-neutral-400">
            ${memberCount === 1
              ? msg(`1 member`)
              : msg(str`${memberCount} members`)}
          </div>
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
        </div>
      </li>
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

  private makeOnOrgClick(org: OrgData) {
    const navigate = () => this.navigate.to(`/orgs/${org.slug}`);

    if (typeof window.getSelection !== "undefined") {
      return () => {
        // Prevent navigation on user text selection
        if (window.getSelection()?.type === "Range") {
          return;
        }

        navigate();
      };
    }

    return navigate;
  }
}
