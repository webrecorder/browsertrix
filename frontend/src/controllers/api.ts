import { msg } from "@lit/localize";
import type { ReactiveController, ReactiveControllerHost } from "lit";
import throttle from "lodash/fp/throttle";

import { APIError } from "@/utils/api";
import AuthService from "@/utils/AuthService";
import { BYTES_PER_GB, BYTES_PER_MB } from "@/utils/bytes";
import appState from "@/utils/state";

export type QuotaUpdateDetail = { reached: boolean };

export interface APIEventMap {
  "btrix-execution-minutes-quota-update": CustomEvent<QuotaUpdateDetail>;
  "btrix-storage-quota-update": CustomEvent<QuotaUpdateDetail>;
}

export enum AbortReason {
  UserCancel = "user-canceled",
  QuotaReached = "storage_quota_reached",
  NetworkError = "network-error",
  RequestTimeout = "request-timeout",
}

type UploadResponseBody = {
  id: string;
  added: boolean;
  storageQuotaReached: boolean;
};

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

  private uploadRequest: XMLHttpRequest | null = null;

  constructor(host: APIController["host"]) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}

  hostDisconnected() {
    this.cancelUpload();
  }

  async fetch<T extends {} | undefined>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
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
      const body = (await resp.json()) as NonNullable<T>;
      return this.handleOk<NonNullable<T>>(body);
    }

    let errorDetail;
    try {
      errorDetail = (await resp.json()).detail;
    } catch {
      /* empty */
    }

    const error = this.handleError(resp.status, errorDetail);
    throw new APIError(error);
  }

  upload(
    path: string,
    file: File,
    abortSignal?: AbortSignal,
    /**
     * Custom XMLHttpRequest['upload'] loadstart and progress event callback,
     * which need to be attached before `send`.
     */
    uploadCallback?: (e: ProgressEvent) => void,
  ): Promise<UploadResponseBody> & { request?: XMLHttpRequest } {
    const auth = appState.auth;

    if (!auth) throw new Error("auth not in state");

    let request: XMLHttpRequest | undefined;

    const promise: Promise<UploadResponseBody> & { request?: XMLHttpRequest } =
      new Promise((resolve, reject) => {
        if (abortSignal?.aborted) {
          reject(AbortReason.UserCancel);
        }
        const xhr = new XMLHttpRequest();

        xhr.open("PUT", `/api${path}`);
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
          if (xhr.status >= 401) {
            reject(
              new APIError(
                this.handleError(
                  xhr.status,
                  xhr.responseType === "json" && xhr.response,
                ),
              ),
            );
          }
        });
        xhr.addEventListener("error", () => {
          reject(AbortReason.NetworkError);
        });
        xhr.addEventListener("timeout", () => {
          reject(AbortReason.RequestTimeout);
        });
        xhr.addEventListener("abort", () => {
          reject(AbortReason.UserCancel);
        });

        if (uploadCallback) {
          const onUploadProgress = throttle(
            file.size > BYTES_PER_GB
              ? 800
              : file.size > BYTES_PER_MB
                ? 400
                : 200,
          )(uploadCallback);

          xhr.upload.addEventListener("loadstart", onUploadProgress);
          xhr.upload.addEventListener("progress", onUploadProgress);
          xhr.upload.addEventListener("load", (e: ProgressEvent) => {
            onUploadProgress.cancel();
            uploadCallback(e);
          });
          xhr.upload.addEventListener("abort", () => onUploadProgress.cancel());
          xhr.upload.addEventListener("error", () => onUploadProgress.cancel());
          xhr.upload.addEventListener("timeout", () =>
            onUploadProgress.cancel(),
          );
        }

        xhr.send(file);

        abortSignal?.addEventListener("abort", () => {
          xhr.abort();
          reject(AbortReason.UserCancel);
        });

        request = xhr;
      });

    promise.request = request;
    this.uploadRequest = request ?? null;

    return promise;
  }

  private readonly handleOk = <T extends {}>(body: T) => {
    if ("storageQuotaReached" in body) {
      const storageQuotaReached = body.storageQuotaReached;

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
    }

    if ("execMinutesQuotaReached" in body) {
      const executionMinutesQuotaReached = body.execMinutesQuotaReached;

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
    }

    return body;
  };

  private readonly handleError = (
    status: Response["status"],
    errorDetail?: unknown,
  ) => {
    let errorDetails = null;
    let errorMessage: string = msg("Unknown API error");

    switch (status) {
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
          errorDetails = [errorDetail];
        } else if (Array.isArray(errorDetail) && errorDetail.length) {
          errorDetails = errorDetail;

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

    return {
      message: errorMessage,
      status: status,
      details: errorDetails,
      errorCode: errorDetail as APIError["errorCode"],
    };
  };

  private cancelUpload() {
    if (this.uploadRequest) {
      this.uploadRequest.abort();
      this.uploadRequest = null;
    }
  }
}
