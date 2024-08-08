/**
 * Store and access application-wide state
 */
import { locked, options, transaction, use } from "lit-shared-state";

import { persist } from "./persist";

import type { AppSettings } from "@/types/app";
import { authSchema, type Auth } from "@/types/auth";
import type { OrgData } from "@/types/org";
import { userInfoSchema, type UserInfo, type UserOrg } from "@/types/user";

export { use };

// Keyed by org ID
type Lookup = Record<string, string>;

export function makeAppStateService() {
  // Prevent state updates from any component
  const { state, unlock } = locked();

  @state()
  class AppState {
    // TODO persist
    settings: AppSettings | null = null;
    userInfo: UserInfo | null = null;

    // TODO persist here
    // @options(persist(window.sessionStorage))
    auth: Auth | null = null;

    // Store org slug in local storage in order to redirect
    // to the most recently visited org on next log in
    @options(persist(window.localStorage))
    orgSlug: string | null = null;

    // Org details
    org: OrgData | null | undefined = undefined;

    orgIdLookup: Lookup | null = null;

    // Use `userOrg` to retrieve the basic org info like name,
    // since `userInfo` will` always available before `org`
    userOrg: UserOrg | undefined = undefined;

    get orgId() {
      return this.userOrg?.id || "";
    }
  }

  const appState = new AppState();

  class AppStateActions {
    get appState() {
      return appState;
    }

    @unlock()
    updateSettings(settings: AppState["settings"]) {
      appState.settings = settings;
    }

    @unlock()
    updateAuth(authState: AppState["auth"]) {
      authSchema.nullable().parse(authState);

      appState.auth = authState;
    }

    @transaction()
    @unlock()
    updateUserInfo(userInfo: AppState["userInfo"]) {
      userInfoSchema.nullable().parse(userInfo);

      appState.userInfo = userInfo;

      this._updateUserOrg();
    }

    @transaction()
    @unlock()
    updateOrgSlug(orgSlug: AppState["orgSlug"]) {
      appState.orgSlug = orgSlug;

      this._updateUserOrg();
    }

    @unlock()
    updateOrg(org: AppState["org"]) {
      appState.org = org;
    }

    @unlock()
    partialUpdateOrg(org: { id: string } & Partial<OrgData>) {
      if (org.id && appState.org?.id === org.id) {
        appState.org = {
          ...appState.org,
          ...org,
        };
      } else {
        console.warn("no matching org in app state");
      }
    }

    @transaction()
    @unlock()
    resetAll() {
      appState.settings = null;
      appState.org = undefined;
      this._resetUser();
    }

    @transaction()
    @unlock()
    resetUser() {
      this._resetUser();
    }

    private _resetUser() {
      appState.auth = null;
      appState.userInfo = null;
      appState.orgSlug = null;
    }

    private _updateUserOrg() {
      appState.userOrg = appState.userInfo?.orgs.find(
        ({ slug }) => slug === appState.orgSlug,
      );
    }
  }

  return new AppStateActions();
}

const AppStateService = makeAppStateService();

export { AppStateService };
export default AppStateService.appState;
