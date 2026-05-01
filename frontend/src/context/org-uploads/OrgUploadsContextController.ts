import { ContextProvider } from "@lit/context";
import { msg } from "@lit/localize";
import { type ReactiveController } from "lit";

import {
  orgUploadsContext,
  orgUploadsInitialValue,
  type OrgUploadsContext,
} from "./org-uploads";
import type {
  OrgUpload,
  OrgUploadCancelRemoveEventDetail,
  OrgUploadEventDetail,
} from "./types";

import type { BtrixElement } from "@/classes/BtrixElement";
import { AbortReason } from "@/controllers/api";

/**
 * Provides data on org uploads to subscribed descendents of a component.
 *
 * @example Usage:
 * ```ts
 * class Component extends BtrixElement {
 *   readonly [orgUploadsContextKey] = new OrgUploadsContextController(this);
 * }
 * ```
 */
export class OrgUploadsContextController implements ReactiveController {
  readonly #host: BtrixElement;
  readonly #context: ContextProvider<{ __context__: OrgUploadsContext }>;
  readonly #uploadRequests = new Map<string, XMLHttpRequest>();

  static uploadsByStatus(context: OrgUploadsContext) {
    const uploads = Object.entries(context);
    const all: (OrgUpload & { uploadId: string })[] = [];
    const canceled: (OrgUpload & { uploadId: string })[] = [];
    const inProgress: (OrgUpload & { uploadId: string })[] = [];

    uploads.forEach(([uploadId, upload]) => {
      const item = { uploadId, ...upload };

      all.push(item);

      if (upload.canceled) {
        canceled.push(item);
      } else if (!upload.itemId) {
        inProgress.push(item);
      }
    });

    return { all, canceled, inProgress };
  }

  constructor(host: BtrixElement) {
    this.#host = host;
    this.#context = new ContextProvider(this.#host, {
      context: orgUploadsContext,
      initialValue: orgUploadsInitialValue,
    });

    host.addController(this);
  }

  hostConnected(): void {
    this.#host.addEventListener("btrix-org-upload", this.onUpload);
    this.#host.addEventListener("btrix-org-upload-cancel", this.onCancel);
    this.#host.addEventListener("btrix-org-upload-remove", this.onRemove);
  }
  hostDisconnected(): void {
    this.#host.removeEventListener("btrix-org-upload", this.onUpload);
    this.#host.removeEventListener("btrix-org-upload-cancel", this.onCancel);
    this.#host.removeEventListener("btrix-org-upload-remove", this.onRemove);
  }

  private readonly onUpload = async (e: CustomEvent<OrgUploadEventDetail>) => {
    e.stopPropagation();

    const { apiPath, file, itemName, uploadId: eventUploadId } = e.detail;

    if (eventUploadId && this.#uploadRequests.has(eventUploadId)) {
      this.abort(eventUploadId);
    }

    const onUploadProgress = (e: ProgressEvent) => {
      this.#context.setValue({
        ...this.#context.value,
        [uploadId]: {
          itemName,
          filename: file.name,
          loaded: e.loaded,
          total: e.total,
        },
      });
    };

    const uploadId = eventUploadId ?? window.crypto.randomUUID();
    const uploadComplete = this.#host.api.upload(
      apiPath,
      file,
      undefined,
      onUploadProgress,
    );
    const request = uploadComplete.request;

    if (request) {
      this.#uploadRequests.set(uploadId, request);
    }

    try {
      const { id } = await uploadComplete;

      this.#context.setValue({
        ...this.#context.value,
        [uploadId]: {
          ...this.#context.value[uploadId],
          itemId: id,
        },
      });
    } catch (err) {
      console.debug(err);

      if (err === AbortReason.UserCancel) {
        console.debug("Upload aborted to user cancel");

        this.#context.setValue({
          ...this.#context.value,
          [uploadId]: {
            ...this.#context.value[uploadId],
            canceled: true,
          },
        });
      } else {
        let message = msg("Sorry, couldn't upload file at this time.");
        console.debug(err);
        if (err === AbortReason.QuotaReached) {
          message = msg(
            "Your org does not have enough storage to upload this file.",
          );
          this.#host.dispatchEvent(
            new CustomEvent("btrix-storage-quota-update", {
              detail: { reached: true },
              bubbles: true,
            }),
          );
        }
        this.#host.notify.toast({
          message: message,
          variant: "danger",
          icon: "exclamation-octagon",
          id: "file-upload-status",
        });
      }
    }

    this.#uploadRequests.delete(uploadId);
  };

  private readonly onCancel = (
    e: CustomEvent<OrgUploadCancelRemoveEventDetail>,
  ) => {
    e.stopPropagation();

    e.detail.uploadIds.forEach(this.abort);
  };

  private readonly onRemove = (
    e: CustomEvent<OrgUploadCancelRemoveEventDetail>,
  ) => {
    e.stopPropagation();

    e.detail.uploadIds.forEach(this.remove);
  };

  private readonly abort = (uploadId: string) => {
    const request = this.#uploadRequests.get(uploadId);

    if (request) {
      request.abort();
    } else {
      console.debug("no request for uploadId", uploadId);
    }
  };

  private readonly remove = (uploadId: string) => {
    const { [uploadId]: _canceled, ...context } = this.#context.value;
    this.#context.setValue(context);
  };
}
