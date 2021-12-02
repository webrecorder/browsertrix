import { APIError } from "./api";

export type Auth = {
  username: string;
  headers: {
    Authorization: string;
  };
  sessionExpiresAt: number;
  tokenExpiresAt: number;
};

export type AuthState = Auth | null;

type LoggedInEventDetail = Auth & {
  api?: boolean;
  firstLogin?: boolean;
};

export interface LoggedInEvent<T = LoggedInEventDetail> extends CustomEvent {
  readonly detail: T;
}

// Check for token freshness every 5 minutes
const FRESHNESS_TIMER_INTERVAL = 60 * 1000 * 5;
// TODO get expires at from server
// Hardcode 1hr expiry for now
const ACCESS_TOKEN_LIFETIME = 1000 * 60 * 60;

export default class AuthService {
  private timerId?: number;
  private _authState: AuthState = null;

  static storageKey = "btrix.auth";
  static unsupportedAuthErrorCode = "UNSUPPORTED_AUTH_TYPE";
  static loggedInEvent = "logged-in";

  get authState() {
    return this._authState;
  }

  static createLoggedInEvent = (detail: LoggedInEventDetail): LoggedInEvent => {
    return new CustomEvent(AuthService.loggedInEvent, { detail });
  };

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

    const authHeaders = AuthService.parseAuthHeaders(await resp.json());

    return {
      username: email,
      headers: authHeaders,
      // TODO get expires at from server
      // Hardcode 1hr expiry for now
      tokenExpiresAt: Date.now() + ACCESS_TOKEN_LIFETIME,
      sessionExpiresAt: Date.now() + 1000 * 60 * 60 * 24,
    };
  }

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

  retrieve(): AuthState {
    const authState = window.localStorage.getItem(AuthService.storageKey);

    if (authState) {
      this._authState = JSON.parse(authState);
      this.checkFreshness();
    }

    return this._authState;
  }

  persist(authState: AuthState) {
    if (authState) {
      this._authState = authState;
      window.localStorage.setItem(
        AuthService.storageKey,
        JSON.stringify(this.authState)
      );
      this.checkFreshness();
    } else {
      console.warn("No authState to persist");
    }
  }

  revoke() {
    this._authState = null;
    window.localStorage.setItem(AuthService.storageKey, "");
  }

  private async checkFreshness() {
    window.clearTimeout(this.timerId);

    if (!this.authState) return;

    console.log(this.authState);

    const paddedNow = Date.now() + FRESHNESS_TIMER_INTERVAL;

    if (this.authState.sessionExpiresAt > paddedNow) {
      if (this.authState.tokenExpiresAt > paddedNow) {
        console.log("not expired");

        // Restart timer
        this.timerId = window.setTimeout(() => {
          this.checkFreshness();
        }, FRESHNESS_TIMER_INTERVAL);
      } else {
        console.log("expires before next check");

        try {
          this._authState = await this.refresh();

          // Restart timer
          this.timerId = window.setTimeout(() => {
            this.checkFreshness();
          }, FRESHNESS_TIMER_INTERVAL);
        } catch (e) {
          console.debug(e);

          // TODO handle
        }
      }
    } else {
      // TODO notify expired
    }
  }

  private async refresh(): Promise<Auth> {
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

    const authHeaders = AuthService.parseAuthHeaders(await resp.json());

    return {
      username: this.authState.username,
      headers: authHeaders,
      // TODO get expires at from server
      // Hardcode 1hr expiry for now
      tokenExpiresAt: Date.now() + ACCESS_TOKEN_LIFETIME,
      sessionExpiresAt: this.authState.sessionExpiresAt,
    };
  }
}
