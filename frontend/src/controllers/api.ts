import { msg } from "@lit/localize";
import type { ReactiveController, ReactiveControllerHost } from "lit";
import throttle from "lodash/fp/throttle";

import { APIError, type Detail } from "@/utils/api";
import AuthService from "@/utils/AuthService";
import appState from "@/utils/state";

export type QuotaUpdateDetail = { reached: boolean };

export interface APIEventMap {
  "btrix-execution-minutes-quota-update": CustomEvent<QuotaUpdateDetail>;
  "btrix-storage-quota-update": CustomEvent<QuotaUpdateDetail>;
}

export enum AbortReason {
  UserCancel = "user-canceled",
  QuotaReached = "storage_quota_reached",
}

/**
 * Utilities for interacting with the Browsertrix backend API
 *
 * @example Usage:
 * ```ts
 * class MyComponent extends LitElement {
 *   private api = new APIController(this);
 *
 *   async getSomething() {
 *     await this.api.fetch("/path")
 *   }
 * }
 * ```
 */
export class APIController implements ReactiveController {
  host: ReactiveControllerHost & EventTarget;

  uploadProgress = 0;

  private uploadRequest: XMLHttpRequest | null = null;

  constructor(host: APIController["host"]) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}

  hostDisconnected() {
    this.cancelUpload();
  }

  async fetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
    const auth = appState.auth;

    if (!auth) throw new Error("auth not in state");

    const { headers, ...opts } = options || {};
    const resp = await fetch("/api" + path, {
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...auth.headers,
      },
      ...opts,
    });

    if (resp.ok) {
      const body = await resp.json();
      const storageQuotaReached = body.storageQuotaReached;
      const executionMinutesQuotaReached = body.execMinutesQuotaReached;
      if (typeof storageQuotaReached === "boolean") {
        if (storageQuotaReached !== appState.org?.storageQuotaReached) {
          this.host.dispatchEvent(
            new CustomEvent<QuotaUpdateDetail>("btrix-storage-quota-update", {
              detail: { reached: storageQuotaReached },
              bubbles: true,
              composed: true,
            }),
          );
        }
      }
      if (typeof executionMinutesQuotaReached === "boolean") {
        if (
          executionMinutesQuotaReached != appState.org?.execMinutesQuotaReached
        ) {
          this.host.dispatchEvent(
            new CustomEvent<QuotaUpdateDetail>(
              "btrix-execution-minutes-quota-update",
              {
                detail: { reached: executionMinutesQuotaReached },
                bubbles: true,
                composed: true,
              },
            ),
          );
        }
      }

      return body as T;
    }

    let errorDetail;
    try {
      errorDetail = (await resp.json()).detail;
    } catch {
      /* empty */
    }

    let errorMessage: string = msg("Unknown API error");

    switch (resp.status) {
      case 401: {
        this.host.dispatchEvent(AuthService.createNeedLoginEvent());
        errorMessage = msg("Need login");
        break;
      }
      case 403: {
        if (errorDetail === "storage_quota_reached") {
          this.host.dispatchEvent(
            new CustomEvent<QuotaUpdateDetail>("btrix-storage-quota-update", {
              detail: { reached: true },
              bubbles: true,
              composed: true,
            }),
          );
          errorMessage = msg("Storage quota reached");
          break;
        }
        if (errorDetail === "exec_minutes_quota_reached") {
          this.host.dispatchEvent(
            new CustomEvent<QuotaUpdateDetail>(
              "btrix-execution-minutes-quota-update",
              {
                detail: { reached: true },
                bubbles: true,
                composed: true,
              },
            ),
          );
          errorMessage = msg("Monthly execution minutes quota reached");
          break;
        }
        break;
      }
      case 404: {
        errorMessage = msg("Not found");
        break;
      }
      default: {
        if (typeof errorDetail === "string") {
          errorMessage = errorDetail;
        } else if (Array.isArray(errorDetail) && errorDetail.length) {
          const fieldDetail = errorDetail[0] || {};
          const { loc, msg } = fieldDetail;

          const fieldName = loc
            .filter((v: unknown) => v !== "body" && typeof v === "string")
            .join(" ");
          errorMessage = `${fieldName} ${msg}`;
        }
        break;
      }
    }

    throw new APIError({
      message: errorMessage,
      status: resp.status,
      details: errorDetail as Detail[],
    });
  }

  async upload(
    path: string,
    file: File,
    abortSignal?: AbortSignal,
  ): Promise<{ id: string; added: boolean; storageQuotaReached: boolean }> {
    const auth = appState.auth;

    if (!auth) throw new Error("auth not in state");

    // TODO handle multiple uploads
    if (this.uploadRequest) {
      console.debug("upload request exists");
      this.cancelUpload();
    }

    return new Promise((resolve, reject) => {
      if (abortSignal?.aborted) {
        reject(AbortReason.UserCancel);
      }
      const xhr = new XMLHttpRequest();

      xhr.open("PUT", `/api/${path}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      Object.entries(auth.headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });
      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          resolve(
            JSON.parse(xhr.response as string) as {
              id: string;
              added: boolean;
              storageQuotaReached: boolean;
            },
          );
        }
        if (xhr.status === 403) {
          reject(AbortReason.QuotaReached);
        }
      });
      xhr.addEventListener("error", () => {
        reject(
          new APIError({
            message: xhr.statusText,
            status: xhr.status,
          }),
        );
      });
      xhr.addEventListener("abort", () => {
        reject(AbortReason.UserCancel);
      });
      xhr.upload.addEventListener("progress", this.onUploadProgress);

      xhr.send(file);

      abortSignal?.addEventListener("abort", () => {
        xhr.abort();
        reject(AbortReason.UserCancel);
      });

      this.uploadRequest = xhr;
    });
  }

  readonly onUploadProgress = throttle(100)((e: ProgressEvent) => {
    this.uploadProgress = (e.loaded / e.total) * 100;

    this.host.requestUpdate();
  });

  private cancelUpload() {
    if (this.uploadRequest) {
      this.uploadRequest.abort();
      this.uploadRequest = null;
    }

    this.onUploadProgress.cancel();
  }
}
