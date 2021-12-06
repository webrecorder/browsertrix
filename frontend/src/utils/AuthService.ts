import { APIError } from "./api";

export type Auth = {
  username: string;
  headers: {
    Authorization: string;
  };
  tokenExpiresAt: number;
};

type Session = {
  sessionExpiresAt: number;
};

export type AuthState = (Auth & Session) | null;

export type LoggedInEventDetail = Auth & {
  api?: boolean;
  firstLogin?: boolean;
  redirectUrl?: string;
};

export interface LoggedInEvent<T = LoggedInEventDetail> extends CustomEvent {
  readonly detail: T;
}

// Check for token freshness every 5 minutes
const FRESHNESS_TIMER_INTERVAL = 60 * 1000 * 5;
const ACCESS_TOKEN_LIFETIME =
  +(process.env.JWT_TOKEN_LIFETIME_SECONDS || 3600) * 1000;
// Hardcode 24h expiry for now
const SESSION_LIFETIME = 1000 * 60 * 60 * 24;

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
      tokenExpiresAt: Date.now() + ACCESS_TOKEN_LIFETIME,
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
    const auth = window.localStorage.getItem(AuthService.storageKey);

    if (auth) {
      this._authState = JSON.parse(auth);
      this.checkFreshness();
    }

    return this._authState;
  }

  startPersist(auth: Auth) {
    if (auth) {
      this.persist(auth);
      this.checkFreshness();
    } else {
      console.warn("No authState to persist");
    }
  }

  logout() {
    window.clearTimeout(this.timerId);
    this.revoke();
  }

  private revoke() {
    this._authState = null;
    window.localStorage.removeItem(AuthService.storageKey);
  }

  private persist(auth: Auth) {
    this._authState = {
      username: auth.username,
      headers: auth.headers,
      tokenExpiresAt: auth.tokenExpiresAt,
      sessionExpiresAt: Date.now() + SESSION_LIFETIME,
    };

    window.localStorage.setItem(
      AuthService.storageKey,
      JSON.stringify(this._authState)
    );
  }

  private async checkFreshness() {
    window.clearTimeout(this.timerId);

    if (!this._authState) return;
    const paddedNow = Date.now() + FRESHNESS_TIMER_INTERVAL;

    if (this._authState.sessionExpiresAt > paddedNow) {
      if (this._authState.tokenExpiresAt > paddedNow) {
        // Restart timer
        this.timerId = window.setTimeout(() => {
          this.checkFreshness();
        }, FRESHNESS_TIMER_INTERVAL);
      } else {
        try {
          const auth = await this.refresh();
          this._authState.headers = auth.headers;
          this._authState.tokenExpiresAt = auth.tokenExpiresAt;

          // Restart timer
          this.timerId = window.setTimeout(() => {
            this.checkFreshness();
          }, FRESHNESS_TIMER_INTERVAL);
        } catch (e) {
          console.debug(e);
        }
      }
    } else {
      this.logout();
    }
  }

  private async refresh(): Promise<{
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

    const authHeaders = AuthService.parseAuthHeaders(await resp.json());

    return {
      headers: authHeaders,
      tokenExpiresAt: Date.now() + ACCESS_TOKEN_LIFETIME,
    };
  }
}
