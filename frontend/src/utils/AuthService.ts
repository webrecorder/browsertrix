import { APIError } from "./api";

export type Auth = {
  username: string;
  headers: {
    Authorization: string;
  };
  /** Timestamp (milliseconds) when token expires */
  tokenExpiresAt: number;
};

export type AuthState = Auth | null;

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

export interface LoggedInEvent<T = LoggedInEventDetail> extends CustomEvent {
  readonly detail: T;
}

// Check for token freshness every 5 minutes
const FRESHNESS_TIMER_INTERVAL = 60 * 1000 * 5;

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

    const data = await resp.json();
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
    return JSON.parse(window.atob(token.split(".")[1]));
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
    };

    window.localStorage.setItem(
      AuthService.storageKey,
      JSON.stringify(this._authState)
    );
  }

  private async checkFreshness() {
    window.clearTimeout(this.timerId);

    // console.debug("checkFreshness authState:", this._authState);

    if (!this._authState) return;
    const paddedNow = Date.now() + FRESHNESS_TIMER_INTERVAL - 500; // tweak padding to account for API fetch time

    if (this._authState.tokenExpiresAt > paddedNow) {
      // console.debug(
      //   "fresh! restart timer tokenExpiresAt:",
      //   new Date(this._authState.tokenExpiresAt)
      // );
      // console.debug("fresh! restart timer paddedNow:", new Date(paddedNow));
      // Restart timer
      this.timerId = window.setTimeout(() => {
        this.checkFreshness();
      }, FRESHNESS_TIMER_INTERVAL);
    } else {
      try {
        const auth = await this.refresh();
        this._authState.headers = auth.headers;
        this._authState.tokenExpiresAt = auth.tokenExpiresAt;
        this.persist(this._authState);

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
          this.checkFreshness();
        }, FRESHNESS_TIMER_INTERVAL);
      } catch (e) {
        console.debug(e);
      }
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

    const data = await resp.json();
    const token = AuthService.decodeToken(data.access_token);
    const authHeaders = AuthService.parseAuthHeaders(data);

    return {
      headers: authHeaders,
      tokenExpiresAt: token.exp * 1000,
    };
  }
}
