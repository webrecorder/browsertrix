import { msg } from "@lit/localize";
import type { ReactiveController, ReactiveControllerHost } from "lit";

import { APIError, type Detail } from "@/utils/api";
import AuthService, { type Auth } from "@/utils/AuthService";
import { AppStateService } from "@/utils/state";

export type QuotaUpdateDetail = { reached: boolean };

/**
 * Utilities for interacting with the Browsertrix backend API
 *
 * @example Usage:
 * ```ts
 * class MyComponent extends LitElement {
 *   private api = new APIController(this);
 *
 *   async getSomething() {
 *     await this.api.fetch("/path", this.authState)
 *   }
 * }
 * ```
 */
export class APIController implements ReactiveController {
  host: ReactiveControllerHost & EventTarget;

  constructor(host: APIController["host"]) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostDisconnected() {}

  async fetch<T = unknown>(
    path: string,
    auth: Auth,
    options?: RequestInit,
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
      const executionMinutesQuotaReached = body.execMinutesQuotaReached;
      if (typeof storageQuotaReached === "boolean") {
        AppStateService.patchOrg({
          storageQuotaReached: storageQuotaReached,
        });
      }
      if (typeof executionMinutesQuotaReached === "boolean") {
        AppStateService.patchOrg({
          execMinutesQuotaReached: executionMinutesQuotaReached,
        });
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
          AppStateService.patchOrg({
            storageQuotaReached: true,
          });
          errorMessage = msg("Storage quota reached");
          break;
        }
        if (errorDetail === "exec_minutes_quota_reached") {
          AppStateService.patchOrg({
            execMinutesQuotaReached: true,
          });
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
}
