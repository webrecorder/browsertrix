/**
 * Adds `apiFetch` helper to lit element
 * @example Usage:
 * ```ts
 * class MyComponent extends LitElementWithAPIFetch {}
 * ```
 */
import { LitElement } from "lit";
import { msg } from "@lit/localize";

import type { Auth } from "@/utils/AuthService";
import AuthService from "@/utils/AuthService";
import { APIError } from "@/utils/api";

type Constructor<T = unknown> = new (...args: any[]) => T;
type APIFetchOptions = {
  method?: string;
  headers?: any;
  body?: any;
  signal?: AbortSignal;
  duplex?: string;
};
declare class APIMixinInterface {
  apiFetch<T = unknown>(
    path: string,
    auth: Auth,
    options?: APIFetchOptions
  ): Promise<T>;
}

export const APIFetchMixin = <T extends Constructor<LitElement>>(
  supClass: T
) => {
  class APIMixinClass extends supClass {
    async apiFetch(path: string, auth: Auth, options?: APIFetchOptions) {
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
          this.dispatchEvent(
            new CustomEvent("storage-quota-update", {
              detail: { reached: storageQuotaReached },
              bubbles: true,
            })
          );
        }
        if (typeof executionMinutesQuotaReached === "boolean") {
          this.dispatchEvent(
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
          this.dispatchEvent(AuthService.createNeedLoginEvent());
          errorMessage = msg("Need login");
          break;
        }
        case 403: {
          if (errorDetail === "storage_quota_reached") {
            this.dispatchEvent(
              new CustomEvent("storage-quota-update", {
                detail: { reached: true },
                bubbles: true,
              })
            );
            errorMessage = msg("Storage quota reached");
            break;
          }
          if (errorDetail === "exec_minutes_quota_reached") {
            this.dispatchEvent(
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

  return APIMixinClass as Constructor<APIMixinInterface> & T;
};

export const LitElementWithAPIFetch = APIFetchMixin(LitElement);
