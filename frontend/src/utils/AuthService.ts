import type { AuthState, Auth } from "../types/auth";
import { APIError } from "./api";

export interface LoggedInEvent<T = Auth> extends CustomEvent {
  readonly detail: T;
}

export default class AuthService {
  private _authState: AuthState = null;

  static storageKey = "btrix.auth";
  static unsupportedAuthErrorCode = "UNSUPPORTED_AUTH_TYPE";
  static loggedInEvent = "logged-in";

  get authState() {
    return this._authState;
  }

  static createLoggedInEvent = (detail: Auth): LoggedInEvent => {
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

    if (data.token_type === "bearer" && data.access_token) {
      return {
        username: email,
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      };
    }

    throw new Error(AuthService.unsupportedAuthErrorCode);
  }

  logout() {
    // TODO
  }

  // setAuth() {
  //   // this._authState = {}
  //   // window.localStorage.setItem("btrix.auth", JSON.stringify(this.authState));
  // }

  // revoke() {
  //   this._authState = null;
  //   window.localStorage.setItem(AuthService.storageKey, "");
  // }
}
