import { APIError } from "./api";
import appState, { AppStateService } from "./state";

import { ROUTES } from "@/routes";
import type { Auth } from "@/types/auth";

type AuthState = Auth | null;
type JWT = {
  user_id: string;
  aud: string[];
  exp: number;
};

export type LoggedInEventDetail = Auth & {
  api?: boolean;
  firstLogin?: boolean;
  redirectUrl?: string;
};

export type NeedLoginEventDetail = {
  redirectUrl?: string;
};

export type LogOutEventDetail = {
  redirect?: boolean;
};

type AuthRequestEventDetail = {
  name: "requesting_auth";
};

type AuthResponseEventDetail = {
  name: "responding_auth";
  auth: AuthState;
};

export type AuthStorageEventDetail = {
  name: "auth_storage";
  value: string | null;
};

export type AuthEventDetail =
  | AuthRequestEventDetail
  | AuthResponseEventDetail
  | AuthStorageEventDetail;

export interface AuthEventMap {
  "btrix-need-login": CustomEvent<NeedLoginEventDetail>;
  "btrix-logged-in": CustomEvent<LoggedInEventDetail>;
  "btrix-log-out": CustomEvent<LogOutEventDetail>;
}

// Check for token freshness every 5 minutes
const FRESHNESS_TIMER_INTERVAL = 60 * 1000 * 5;

export default class AuthService {
  private timerId?: number;

  static storageKey = "btrix.auth";
  static unsupportedAuthErrorCode = "UNSUPPORTED_AUTH_TYPE";
  static loggedInEvent: keyof AuthEventMap = "btrix-logged-in";
  static logOutEvent: keyof AuthEventMap = "btrix-log-out";
  static needLoginEvent: keyof AuthEventMap = "btrix-need-login";

  static broadcastChannel = new BroadcastChannel(AuthService.storageKey);
  static storage = {
    getItem() {
      return window.sessionStorage.getItem(AuthService.storageKey);
    },
    setItem(newValue: string) {
      const oldValue = AuthService.storage.getItem();
      if (oldValue === newValue) return;
      window.sessionStorage.setItem(AuthService.storageKey, newValue);
      AuthService.broadcastChannel.postMessage({
        name: "auth_storage",
        value: newValue,
      } as AuthStorageEventDetail);
    },
    removeItem() {
      const oldValue = AuthService.storage.getItem();
      if (!oldValue) return;
      window.sessionStorage.removeItem(AuthService.storageKey);
      AuthService.broadcastChannel.postMessage({
        name: "auth_storage",
        value: null,
      } as AuthStorageEventDetail);
    },
  };

  get authState() {
    return appState.auth;
  }
  private set authState(authState: AuthState) {
    AppStateService.updateAuth(authState);
  }

  static createLoggedInEvent = (
    detail?: LoggedInEventDetail,
  ): CustomEvent<LoggedInEventDetail> =>
    new CustomEvent<LoggedInEventDetail>(AuthService.loggedInEvent, {
      bubbles: true,
      composed: true,
      detail,
    });

  static createLogOutEvent = (
    detail?: LogOutEventDetail,
  ): CustomEvent<LogOutEventDetail> =>
    new CustomEvent<LogOutEventDetail>(AuthService.logOutEvent, {
      bubbles: true,
      composed: true,
      detail,
    });

  static createNeedLoginEvent = (
    detail?: NeedLoginEventDetail,
  ): CustomEvent<NeedLoginEventDetail> =>
    new CustomEvent<NeedLoginEventDetail>(AuthService.needLoginEvent, {
      bubbles: true,
      composed: true,
      detail,
    });

  static async login({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<Auth> {
    const resp = await fetch("/api/auth/jwt/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: email,
        password: password,
      }).toString(),
    });

    if (resp.status !== 200) {
      throw new APIError({
        message: resp.statusText,
        status: resp.status,
      });
    }

    const data = (await resp.json()) as {
      token_type: string;
      access_token: string;
    };
    const token = AuthService.decodeToken(data.access_token);
    const authHeaders = AuthService.parseAuthHeaders(data);

    return {
      username: email,
      headers: authHeaders,
      tokenExpiresAt: token.exp * 1000,
    };
  }

  /**
   * Decode JSON web token returned as access token
   */
  private static decodeToken(token: string): JWT {
    return JSON.parse(window.atob(token.split(".")[1])) as JWT;
  }

  /**
   * Build authorization headers from login response
   */
  private static parseAuthHeaders(data: {
    token_type: string;
    access_token: string;
  }): Auth["headers"] {
    if (data.token_type === "bearer" && data.access_token) {
      return {
        Authorization: `Bearer ${data.access_token}`,
      };
    }

    throw new Error(AuthService.unsupportedAuthErrorCode);
  }

  /**
   * Retrieve or set auth data from shared session
   * and set up session syncing
   */
  static async initSessionStorage(): Promise<AuthState> {
    const authState =
      AuthService.getCurrentTabAuth() ||
      (await AuthService.getSharedSessionAuth());

    AuthService.broadcastChannel.addEventListener(
      "message",
      ({ data }: MessageEvent<AuthEventDetail>) => {
        if (data.name === "requesting_auth") {
          // A new tab/window opened and is requesting shared auth
          AuthService.broadcastChannel.postMessage({
            name: "responding_auth",
            auth: AuthService.getCurrentTabAuth(),
          } as AuthResponseEventDetail);
        }
      },
    );

    return authState;
  }

  private static getCurrentTabAuth(): AuthState {
    const auth = AuthService.storage.getItem();

    if (auth) {
      return JSON.parse(auth) as AuthState;
    }

    return null;
  }

  /**
   * Retrieve shared session from another tab/window
   **/
  private static async getSharedSessionAuth(): Promise<AuthState> {
    const broadcastPromise = new Promise<AuthState>((resolve) => {
      // Check if there's any authenticated tabs
      AuthService.broadcastChannel.postMessage({
        name: "requesting_auth",
      } as AuthRequestEventDetail);
      // Wait for another tab to respond
      const cb = ({ data }: MessageEvent<AuthEventDetail>) => {
        if (data.name === "responding_auth") {
          AuthService.broadcastChannel.removeEventListener("message", cb);
          resolve(data.auth);
        }
      };
      AuthService.broadcastChannel.addEventListener("message", cb);
    });
    // Ensure that `getSharedSessionAuth` is resolved within a reasonable
    // timeframe, even if another window/tab doesn't respond:
    const timeoutPromise = new Promise<null>((resolve) => {
      window.setTimeout(() => {
        resolve(null);
      }, 10);
    });

    return Promise.race([broadcastPromise, timeoutPromise]).then(
      (value) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (value?.username && value.headers && value.tokenExpiresAt) {
          return value;
        } else {
          return null;
        }
      },
      (error) => {
        console.debug(error);
        return null;
      },
    );
  }

  constructor() {
    // Only have freshness check run in visible tab(s)
    document.addEventListener("visibilitychange", () => {
      if (!this.authState) return;
      if (document.visibilityState === "visible") {
        this.startFreshnessCheck();
      } else {
        this.cancelFreshnessCheck();
      }
    });
  }

  saveLogin(auth: Auth) {
    this.persist(auth);
    this.startFreshnessCheck();
  }

  logout() {
    this.cancelFreshnessCheck();
    this.revoke();
  }

  startFreshnessCheck() {
    window.clearTimeout(this.timerId);
    void this.checkFreshness();
  }

  private cancelFreshnessCheck() {
    window.clearTimeout(this.timerId);
    this.timerId = undefined;
  }

  private revoke() {
    this.authState = null;
    AuthService.storage.removeItem();
  }

  persist(auth: Auth) {
    this.authState = auth;
    AuthService.storage.setItem(JSON.stringify(auth));
  }

  private async checkFreshness() {
    // console.debug("checkFreshness authState:", this._authState);

    if (!this.authState) return;
    const paddedNow = Date.now() + FRESHNESS_TIMER_INTERVAL - 500; // tweak padding to account for API fetch time

    if (this.authState.tokenExpiresAt > paddedNow) {
      // console.debug(
      //   "fresh! restart timer tokenExpiresAt:",
      //   new Date(this.authState.tokenExpiresAt)
      // );
      // console.debug("fresh! restart timer paddedNow:", new Date(paddedNow));
      // Restart timer
      this.timerId = window.setTimeout(() => {
        void this.checkFreshness();
      }, FRESHNESS_TIMER_INTERVAL);
    } else {
      try {
        const auth = await this.refresh();
        this.authState = {
          ...this.authState,
          ...auth,
        };
        this.persist(this.authState);

        // console.debug(
        //   "refreshed. restart timer tokenExpiresAt:",
        //   new Date(this._authState.tokenExpiresAt)
        // );
        // console.debug(
        //   "refreshed. restart timer paddedNow:",
        //   new Date(paddedNow)
        // );

        // Restart timer
        this.timerId = window.setTimeout(() => {
          void this.checkFreshness();
        }, FRESHNESS_TIMER_INTERVAL);
      } catch (e) {
        console.debug(e);

        this.logout();
        const { pathname, search, hash } = window.location;
        const redirectUrl =
          pathname !== ROUTES.login && pathname !== ROUTES.home
            ? `${pathname}${search}${hash}`
            : "";
        window.dispatchEvent(AuthService.createNeedLoginEvent({ redirectUrl }));
      }
    }
  }

  async refresh(): Promise<{
    headers: Auth["headers"];
    tokenExpiresAt: Auth["tokenExpiresAt"];
  }> {
    if (!this.authState) {
      throw new Error("No this.authState");
    }

    const resp = await fetch("/api/auth/jwt/refresh", {
      method: "POST",
      headers: this.authState.headers,
    });

    if (resp.status !== 200) {
      throw new APIError({
        message: resp.statusText,
        status: resp.status,
      });
    }

    const data = (await resp.json()) as {
      token_type: string;
      access_token: string;
    };
    const token = AuthService.decodeToken(data.access_token);
    const authHeaders = AuthService.parseAuthHeaders(data);

    return {
      headers: authHeaders,
      tokenExpiresAt: token.exp * 1000,
    };
  }
}
