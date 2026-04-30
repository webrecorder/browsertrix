import { consume, ContextConsumer } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
import type { SlAlert } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import sum from "lodash/fp/sum";

import { BtrixElement } from "@/classes/BtrixElement";
import notificationsContext from "@/context/notifications";
import orgUploadsContext, {
  type OrgUploadsContext,
} from "@/context/org-uploads";
import type {
  OrgUpload,
  OrgUploadCancelRemoveEventDetail,
} from "@/context/org-uploads/types";
import { notifyIconFor } from "@/controllers/notify";
import { OrgTab } from "@/routes";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

@customElement("btrix-org-uploads-overlay")
@localized()
export class OrgUploadsOverlay extends BtrixElement {
  readonly #notifications = new ContextConsumer(this, {
    context: notificationsContext,
    subscribe: true,
    callback: () => this.updateToastStackOffset(),
  });

  @consume({ context: orgUploadsContext, subscribe: true })
  @state()
  private readonly orgUploads: OrgUploadsContext = {};

  @state()
  private minimized = false;

  @state()
  private canceling?: string;

  @query("sl-alert")
  private readonly alert?: SlAlert;

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("orgUploads")) {
      if (
        this.canceling &&
        this.canceling in this.orgUploads &&
        this.orgUploads[this.canceling].canceled
      ) {
        this.canceling = undefined;
      }
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("orgUploads") ||
      changedProperties.has("minimized")
    ) {
      this.updateToastStackOffset();
    }

    if (changedProperties.has("orgUploads")) {
      void this.updateAlertVisibility();
    }
  }

  private async updateAlertVisibility() {
    const uploadIds = Object.keys(this.orgUploads);

    if (uploadIds.length) {
      await this.alert?.updateComplete;
      await this.alert?.show();
    } else {
      await this.alert?.hide();
    }
  }

  /**
   * Offset app notification stack so that org uploads are always pinned to the bottom.
   */
  private readonly updateToastStackOffset = () => {
    const uploadIds = Object.keys(this.orgUploads);

    if (uploadIds.length && this.#notifications.value?.length) {
      document.body.style.setProperty(
        "--btrix-toast-stack-offset",
        this.minimized
          ? "5.375rem"
          : `calc(${(1 + uploadIds.length) * 2.625}rem + 2.75rem)`,
      );
    } else {
      document.body.style.removeProperty("--btrix-toast-stack-offset");
    }
  };

  render() {
    const canceledUploads = [];
    const uploadsInProgress = [];

    Object.entries(this.orgUploads).forEach(([id, upload]) => {
      if (upload.canceled) {
        canceledUploads.push(id);
      } else if (!upload.itemId) {
        uploadsInProgress.push(id);
      }
    });

    const uploads = Object.entries(this.orgUploads);
    const totalCount = uploads.length;
    const inProgressCount = uploadsInProgress.length;
    const canceledCount = canceledUploads.length;
    const allDone = inProgressCount === 0;
    const allCanceled = canceledCount === totalCount;

    const sumLoaded = sum(uploads.map(([_id, { loaded }]) => loaded));
    const sumTotal = sum(uploads.map(([_id, { total }]) => total));

    const number_of_files_in_progress = this.localize.number(inProgressCount);
    const plural_of_files_in_progress = pluralOf("files", inProgressCount);
    const number_of_files = this.localize.number(totalCount);
    const plural_of_files = pluralOf("files", totalCount);
    const plural_of_uploads = pluralOf("uploads", canceledCount);

    return html`
      <div
        class="pointer-events-none fixed bottom-0 top-auto z-[var(--sl-z-index-toast)] max-h-full w-[28rem] max-w-full overflow-auto [inset-inline-end:0]"
      >
        <sl-alert
          variant=${allDone && !allCanceled ? "success" : "primary"}
          class="pointer-events-auto m-4 part-[base]:shadow-lg"
          duration=${allCanceled ? 5000 : Infinity}
          @sl-after-hide=${() => {
            const uploadIds = Object.keys(this.orgUploads);

            this.dispatchEvent(
              new CustomEvent<OrgUploadCancelRemoveEventDetail>(
                "btrix-org-upload-remove",
                {
                  detail: { uploadIds },
                  bubbles: true,
                  composed: true,
                },
              ),
            );
          }}
        >
          <sl-icon
            name=${allDone
              ? allCanceled
                ? notifyIconFor["info"]
                : notifyIconFor["success"]
              : "upload"}
            slot="icon"
          ></sl-icon>

          <div class="flex h-8 items-center gap-1">
            <div class="flex-1 truncate font-semibold">
              ${allCanceled
                ? msg(str`Canceled file ${plural_of_uploads}`)
                : allDone
                  ? msg(str`Uploaded ${number_of_files} ${plural_of_files}`)
                  : msg(
                      str`Uploading ${number_of_files_in_progress} ${plural_of_files_in_progress}`,
                    )}
            </div>

            ${this.minimized && !allCanceled
              ? html`<div class="font-monostyle text-xs text-neutral-500">
                  ${sumLoaded < sumTotal
                    ? `${this.localize.bytes(sumLoaded)} / `
                    : nothing}
                  ${this.localize.bytes(sumTotal)}
                </div>`
              : nothing}
            <sl-icon-button
              class="text-base"
              name=${this.minimized
                ? "chevron-bar-expand"
                : "chevron-bar-contract"}
              label=${this.minimized ? msg("Expand") : msg("Minimize")}
              @click=${() => (this.minimized = !this.minimized)}
            ></sl-icon-button>
            ${allDone
              ? html`<sl-icon-button
                  name="x-lg"
                  label=${msg("Close")}
                  @click=${() => void this.alert?.hide()}
                ></sl-icon-button>`
              : nothing}
          </div>

          <div
            class=${clsx(
              tw`overflow-hidden transition-opacity`,
              this.minimized && tw`max-h-0 opacity-0`,
            )}
          >
            ${repeat(
              uploads,
              ([id]) => id,
              ([id, upload]) => this.renderUpload(id, upload),
            )}
          </div>
        </sl-alert>
      </div>

      ${this.renderDialog()}
    `;
  }

  private readonly renderUpload = (uploadId: string, upload: OrgUpload) => {
    const progress = (upload.loaded / upload.total) * 100;
    const removeOrHide = () => {
      if (Object.keys(this.orgUploads).length > 1) {
        this.dispatchEvent(
          new CustomEvent<OrgUploadCancelRemoveEventDetail>(
            "btrix-org-upload-remove",
            {
              detail: { uploadIds: [uploadId] },
              bubbles: true,
              composed: true,
            },
          ),
        );
      } else {
        void this.alert?.hide();
      }
    };

    return html`
      <div class="mt-2.5 flex h-8 gap-3">
        <div class="flex-1 overflow-hidden">
          <div class="mb-1.5 flex gap-2 whitespace-nowrap text-xs">
            <div
              class="flex-1 truncate text-neutral-800"
              title=${upload.itemName}
            >
              ${upload.itemName}
            </div>
            <div class="font-monostyle text-neutral-500">
              ${upload.canceled
                ? msg("Canceled")
                : html`${upload.loaded < upload.total
                    ? `${this.localize.bytes(upload.loaded)} / `
                    : nothing}
                  ${this.localize.bytes(upload.total)}`}
            </div>
          </div>
          <sl-progress-bar
            value=${upload.canceled ? 0 : progress}
            ?indeterminate=${!progress}
          ></sl-progress-bar>
        </div>
        ${upload.itemId
          ? html`<sl-icon-button
              href=${`${this.navigate.orgBasePath}/${OrgTab.Items}/upload/${upload.itemId}`}
              name="link"
              class="text-base"
              label=${msg("Visit Link")}
              @click=${(e: MouseEvent) => {
                removeOrHide();
                this.navigate.link(e);
              }}
            ></sl-icon-button>`
          : html`<sl-icon-button
              name="x-lg"
              label=${msg("Cancel Upload")}
              @click=${() => {
                if (upload.canceled) {
                  removeOrHide();
                } else {
                  this.canceling = uploadId;
                }
              }}
            ></sl-icon-button>`}
      </div>
    `;
  };

  private renderDialog() {
    const upload = this.canceling ? this.orgUploads[this.canceling] : undefined;
    const upload_name = upload?.itemName;

    return html`<btrix-dialog
      label=${msg("Cancel Upload?")}
      ?open=${Boolean(upload)}
    >
      <p>
        ${msg(str`Are you sure you want to cancel uploading “${upload_name}”?`)}
      </p>
      <div slot="footer" class="flex justify-between">
        <sl-button size="small" @click=${() => (this.canceling = undefined)}
          >${msg("Continue Upload")}</sl-button
        >
        <sl-button
          variant="danger"
          size="small"
          @click=${async () => {
            if (!this.canceling) return;

            this.dispatchEvent(
              new CustomEvent<OrgUploadCancelRemoveEventDetail>(
                "btrix-org-upload-cancel",
                {
                  detail: { uploadIds: [this.canceling] },
                  bubbles: true,
                  composed: true,
                },
              ),
            );
          }}
        >
          ${msg("Cancel Upload")}
        </sl-button>
      </div>
    </btrix-dialog>`;
  }
}
