import type { LitElement, ReactiveController } from "lit";
import { msg } from "@lit/localize";

import type { Auth } from "@/utils/AuthService";
import AuthService from "@/utils/AuthService";
import { APIError } from "@/utils/api";

export type APIFetchOptions = {
  method?: string;
  headers?: any;
  body?: any;
  signal?: AbortSignal;
  duplex?: string;
};

export class APIController implements ReactiveController {
  host: LitElement;

  constructor(host: LitElement) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostDisconnected() {}

  async apiFetch<T = unknown>(
    path: string,
    auth: Auth,
    options?: APIFetchOptions
  ): Promise<T> {
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
      const executionMinutesQuotaReached = body.executionMinutesQuotaReached;
      if (typeof storageQuotaReached === "boolean") {
        this.host.dispatchEvent(
          new CustomEvent("storage-quota-update", {
            detail: { reached: storageQuotaReached },
            bubbles: true,
          })
        );
      }
      if (typeof executionMinutesQuotaReached === "boolean") {
        this.host.dispatchEvent(
          new CustomEvent("execution-minutes-quota-update", {
            detail: { reached: executionMinutesQuotaReached },
            bubbles: true,
          })
        );
      }

      return body;
    }

    let errorDetail;
    try {
      errorDetail = (await resp.json()).detail;
    } catch {}

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
            new CustomEvent("storage-quota-update", {
              detail: { reached: true },
              bubbles: true,
            })
          );
          errorMessage = msg("Storage quota reached");
          break;
        }
        if (errorDetail === "exec_minutes_quota_reached") {
          this.host.dispatchEvent(
            new CustomEvent("execution-minutes-quota-update", {
              detail: { reached: true },
              bubbles: true,
            })
          );
          errorMessage = msg("Monthly execution minutes quota reached");
          break;
        }
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
            .filter((v: any) => v !== "body" && typeof v === "string")
            .join(" ");
          errorMessage = `${fieldName} ${msg}`;
        }
        break;
      }
    }

    throw new APIError({
      message: errorMessage,
      status: resp.status,
      details: errorDetail,
    });
  }
}
