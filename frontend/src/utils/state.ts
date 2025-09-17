/**
 * Store and access application-wide state
 */
import { mergeDeep } from "immutable";
import { locked, options, transaction, use } from "lit-shared-state";

import { persist } from "./persist";

import { authSchema, type Auth } from "@/types/auth";
import type { OrgData } from "@/types/org";
import {
  userInfoSchema,
  userPreferencesSchema,
  type UserInfo,
  type UserOrg,
  type UserPreferences,
} from "@/types/user";
import type { AppSettings } from "@/utils/app";
import { isAdmin, isCrawler } from "@/utils/orgs";

export { use };

export function makeAppStateService() {
  // Prevent state updates from any component
  const { state, unlock } = locked();

  @state()
  class AppState {
    @options(persist(window.sessionStorage))
    settings: AppSettings | null = null;

    @options(persist(window.sessionStorage))
    userInfo: UserInfo | null = null;

    @options(persist(window.localStorage))
    userPreferences: UserPreferences | null = null;

    // TODO persist here
    auth: Auth | null = null;

    // Store user's org slug preference in local storage in order to redirect
    // to the most recently visited org on next log in.
    //
    // FIXME Since the org slug preference is removed on log out, AuthService
    // currently checks whether `orgSlug` is being removed in a `storage`
    // event to determine whether another tab has logged out.
    // It's not the cleanest solution to use `orgSlug` as a cross-tab logout
    // event, so we may want to refactor this in the future.
    //
    // TODO move to `userPreferences`
    @options(persist(window.localStorage))
    orgSlug: string | null = null;

    // Org details
    org: OrgData | null | undefined = undefined;

    userGuideOpen = false;

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

      if (appState.orgSlug && appState.userInfo && !userOrg) {
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
    partialUpdateUserPreferences(
      userPreferences: Partial<AppState["userPreferences"]>,
    ) {
      userPreferencesSchema.nullable().parse(userPreferences);

      if (appState.userPreferences && userPreferences) {
        appState.userPreferences = mergeDeep(
          appState.userPreferences,
          userPreferences,
        );
      } else {
        appState.userPreferences = userPreferences;
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

    @unlock()
    updateUserGuideOpen(open: boolean) {
      appState.userGuideOpen = open;
    }

    @transaction()
    @unlock()
    resetAll() {
      appState.settings = null;
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
      appState.userPreferences = null;
      appState.orgSlug = null;
      appState.org = undefined;
    }
  }

  return new AppStateActions();
}

const AppStateService = makeAppStateService();

export { AppStateService };
export default AppStateService.appState;
