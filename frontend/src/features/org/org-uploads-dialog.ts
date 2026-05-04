import { ContextConsumer } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
import type { SlAlert, SlIconButton } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import sum from "lodash/fp/sum";

import { BtrixElement } from "@/classes/BtrixElement";
import notificationsContext from "@/context/notifications";
import orgUploadsContext from "@/context/org-uploads";
import { orgUploadsInitialValue } from "@/context/org-uploads/org-uploads";
import { OrgUploadsContextController } from "@/context/org-uploads/OrgUploadsContextController";
import type {
  OrgUpload,
  OrgUploadCancelRemoveEventDetail,
} from "@/context/org-uploads/types";
import { notifyIconFor } from "@/controllers/notify";
import { OrgTab } from "@/routes";
import { stopProp } from "@/utils/events";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

/**
 * Displays status of org-wide uploads in a non-modal dialog.
 */
@customElement("btrix-org-uploads-dialog")
@localized()
export class OrgUploadsDialog extends BtrixElement {
  readonly #notifications = new ContextConsumer(this, {
    context: notificationsContext,
    subscribe: true,
    callback: () => this.updateToastStackOffset(),
  });

  readonly #orgUploads = new ContextConsumer(this, {
    context: orgUploadsContext,
    subscribe: true,
    callback: (value) => {
      this.uploadsByStatus = OrgUploadsContextController.uploadsByStatus(value);

      if (this.cancelIds.size) {
        // Remove IDs that have been removed
        this.cancelIds = new Set(Object.keys(value)).intersection(
          this.cancelIds,
        );
      }
    },
  });

  @state()
  private uploadsByStatus = OrgUploadsContextController.uploadsByStatus(
    orgUploadsInitialValue,
  );

  @state()
  private open = false;

  @state()
  private minimized = false;

  @state()
  private cancelIds = new Set<string>();

  @query("sl-alert")
  private readonly alert?: SlAlert;

  get uploadIds() {
    return this.uploadsByStatus.all.map(({ uploadId }) => uploadId);
  }

  protected updated(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("uploadsByStatus") ||
      changedProperties.has("minimized")
    ) {
      this.updateToastStackOffset();
    }

    if (changedProperties.has("uploadsByStatus")) {
      void this.updateAlertVisibility();
    }
  }

  private async updateAlertVisibility() {
    await this.alert?.updateComplete;

    const uploadIds = this.uploadIds;

    if (uploadIds.length) {
      this.open = true;
    } else {
      this.open = false;
    }
  }

  /**
   * Offset app notification stack so that org uploads are always pinned to the bottom.
   */
  private readonly updateToastStackOffset = () => {
    const uploadIds = this.uploadIds;

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
    const { all, canceled, inProgress } = this.uploadsByStatus;
    const totalCount = all.length;
    const inProgressCount = inProgress.length;
    const canceledCount = canceled.length;
    const allDone = inProgressCount === 0;
    const allCanceled = canceledCount === totalCount;

    const sumLoaded = sum(all.map(({ loaded }) => loaded));
    const sumTotal = sum(all.map(({ total }) => total));

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
          ?open=${this.open}
          @sl-after-hide=${() => {
            this.dispatchEvent(
              new CustomEvent<OrgUploadCancelRemoveEventDetail>(
                "btrix-org-upload-remove",
                {
                  detail: { uploadIds: this.uploadIds },
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
              ? html`<button
                  class="font-monostyle text-xs text-neutral-500"
                  @click=${() => (this.minimized = false)}
                >
                  ${sumLoaded < sumTotal
                    ? `${this.localize.bytes(sumLoaded)} / `
                    : nothing}
                  ${this.localize.bytes(sumTotal)}
                </button>`
              : nothing}
            <sl-icon-button
              class="shrink-0 text-base"
              name=${this.minimized
                ? "chevron-bar-expand"
                : "chevron-bar-contract"}
              label=${this.minimized ? msg("Expand") : msg("Minimize")}
              @click=${() => (this.minimized = !this.minimized)}
            ></sl-icon-button>
            <sl-icon-button
              class="shrink-0 text-base"
              name="x-lg"
              label=${msg("Close")}
              @click=${() => {
                if (inProgressCount) {
                  this.cancelIds = new Set(
                    inProgress.map(({ uploadId }) => uploadId),
                  );
                } else {
                  this.open = false;
                }
              }}
            ></sl-icon-button>
          </div>

          <div
            class=${clsx(
              tw`overflow-hidden transition-opacity`,
              this.minimized && tw`max-h-0 opacity-0`,
            )}
          >
            ${repeat(all, ({ uploadId }) => uploadId, this.renderUpload)}
          </div>
        </sl-alert>
      </div>

      ${this.renderDialog()}
    `;
  }

  private readonly renderUpload = (
    upload: OrgUpload & { uploadId: string },
  ) => {
    const progress = (upload.loaded / upload.total) * 100;
    const uploaded = upload.loaded === upload.total;
    const isItem = Boolean(upload.itemId);

    const removeOrHide = () => {
      if (this.uploadIds.length > 1) {
        this.dispatchEvent(
          new CustomEvent<OrgUploadCancelRemoveEventDetail>(
            "btrix-org-upload-remove",
            {
              detail: { uploadIds: [upload.uploadId] },
              bubbles: true,
              composed: true,
            },
          ),
        );
      } else {
        this.open = false;
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
              ${isItem
                ? msg("Uploaded")
                : upload.canceled
                  ? msg("Canceled")
                  : uploaded
                    ? msg("Finishing")
                    : html`${this.localize.bytes(upload.loaded)} /
                      ${this.localize.bytes(upload.total)}`}
            </div>
          </div>
          <sl-progress-bar
            class=${clsx(
              // Handle delay between when file is uploaded but item
              // hasn't been created yet
              uploaded && !isItem && tw`part-[indicator]:animate-pulse`,
              isItem &&
                tw`[--btrix-indicator-border-color:var(--sl-color-success-700)] [--indicator-color:var(--sl-color-success-500)]`,
            )}
            value=${upload.canceled ? 0 : progress}
          ></sl-progress-bar>
        </div>
        ${uploaded
          ? html`<btrix-popover
              content=${msg("Link will be available when finished")}
              ?disabled=${isItem}
              @sl-show=${stopProp}
              @sl-after-show=${stopProp}
              @sl-hide=${stopProp}
              @sl-after-hide=${stopProp}
              hoist
            >
              <sl-icon-button
                href=${`${this.navigate.orgBasePath}/${OrgTab.Items}/upload/${upload.itemId}`}
                name="link"
                class=${clsx(tw`text-base`, !isItem && tw`opacity-30`)}
                label=${msg("Visit Link")}
                ?disabled=${!isItem}
                @click=${(e: MouseEvent) => {
                  if ((e.target as SlIconButton).disabled) {
                    e.preventDefault();
                    return;
                  }
                  removeOrHide();
                  this.navigate.link(e);
                }}
              ></sl-icon-button>
            </btrix-popover>`
          : html`<sl-icon-button
              name="x"
              class="text-base"
              label=${msg("Cancel Upload")}
              @click=${() => {
                if (upload.canceled) {
                  removeOrHide();
                } else {
                  this.cancelIds = new Set([upload.uploadId]);
                }
              }}
            ></sl-icon-button>`}
      </div>
    `;
  };

  private renderDialog() {
    const cancelCount = this.cancelIds.size;
    const someCanceled = new Set(
      this.uploadsByStatus.canceled.map(({ uploadId }) => uploadId),
    ).intersection(this.cancelIds);
    const isSomeCanceling = Boolean(someCanceled.size);

    const message = () => {
      if (cancelCount === 1) {
        const uploadId = this.cancelIds.values().next().value;
        const orgUploads = this.#orgUploads.value;

        if (uploadId && orgUploads?.[uploadId]) {
          const upload_name = orgUploads[uploadId].itemName;
          return msg(
            str`Are you sure you want to cancel uploading “${upload_name}”?`,
          );
        }
      }

      const number_of_files = this.localize.number(cancelCount);
      const plural_of_files = pluralOf("files", cancelCount);

      return msg(
        str`Are you sure you want to cancel uploading ${number_of_files} ${plural_of_files}?`,
      );
    };

    return html`<btrix-dialog
      label=${msg("Cancel Upload?")}
      ?open=${Boolean(cancelCount)}
    >
      <p>${message()}</p>
      <div slot="footer" class="flex justify-between">
        <sl-button size="small" @click=${() => (this.cancelIds = new Set())}
          >${msg("Continue Upload")}</sl-button
        >
        <sl-button
          variant="danger"
          size="small"
          ?loading=${isSomeCanceling}
          ?disabled=${isSomeCanceling}
          @click=${async () => {
            this.dispatchEvent(
              new CustomEvent<OrgUploadCancelRemoveEventDetail>(
                "btrix-org-upload-cancel",
                {
                  detail: { uploadIds: Array.from(this.cancelIds.values()) },
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
