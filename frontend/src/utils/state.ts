/**
 * Store and access application-wide state
 */
import { locked, options, transaction, use } from "lit-shared-state";

import { persist } from "./persist";

import type { AppSettings } from "@/types/app";
import { authSchema, type Auth } from "@/types/auth";
import type { OrgData } from "@/types/org";
import { userInfoSchema, type UserInfo, type UserOrg } from "@/types/user";
import { isAdmin, isCrawler } from "@/utils/orgs";

export { use };

// Keyed by org ID
type Lookup = Record<string, string>;

export function makeAppStateService() {
  // Prevent state updates from any component
  const { state, unlock } = locked();

  @state()
  class AppState {
    @options(persist(window.localStorage))
    settings: AppSettings | null = null;

    @options(persist(window.sessionStorage))
    userInfo: UserInfo | null = null;

    // TODO persist here
    auth: Auth | null = null;

    // Store org slug in local storage in order to redirect
    // to the most recently visited org on next log in
    @options(persist(window.localStorage))
    orgSlug: string | null = null;

    // Org details
    org: OrgData | null | undefined = undefined;

    orgIdLookup: Lookup | null = null;

    // Since org slug is used to ID an org, use `userOrg`
    // to retrieve the basic org info like name and ID
    // before other org details are available
    get userOrg(): UserOrg | null {
      const userOrg =
        (appState.orgSlug &&
          appState.userInfo?.orgs.find(
            ({ slug }) => slug === appState.orgSlug,
          )) ||
        null;

      if (!userOrg) {
        console.debug("no user org matching slug in state");
      }

      return userOrg;
    }

    get orgId() {
      return this.userOrg?.id || "";
    }

    get isAdmin() {
      const userOrg = this.userOrg;
      if (userOrg) return isAdmin(userOrg.role);
      return false;
    }

    get isCrawler() {
      const userOrg = this.userOrg;
      if (userOrg) return isCrawler(userOrg.role);
      return false;
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
    updateUser(userInfo: AppState["userInfo"], orgSlug?: AppState["orgSlug"]) {
      userInfoSchema.nullable().parse(userInfo);

      appState.userInfo = userInfo;

      if (orgSlug) {
        appState.orgSlug = orgSlug;
      } else if (
        userInfo?.orgs.length &&
        !userInfo.isSuperAdmin &&
        !appState.orgSlug
      ) {
        appState.orgSlug = userInfo.orgs[0].slug;
      }
    }

    @transaction()
    @unlock()
    updateOrgSlug(orgSlug: AppState["orgSlug"]) {
      appState.orgSlug = orgSlug;
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
  }

  return new AppStateActions();
}

const AppStateService = makeAppStateService();

export { AppStateService };
export default AppStateService.appState;
