/**
 * Store and access application-wide state
 */
import { locked, options, use } from "lit-shared-state";

import { persist } from "./persist";

import type { AppSettings } from "@/types/app";
import { authSchema, type Auth } from "@/types/auth";
import type { OrgData } from "@/types/org";
import { userInfoSchema, type UserInfo } from "@/types/user";

export { use };

// Keyed by org ID
type SlugLookup = Record<string, string>;

class AppState {
  // TODO persist
  settings: AppSettings | null = null;
  userInfo: UserInfo | null = null;
  org: OrgData | null | undefined = undefined;

  // TODO persist here
  // @options(persist(window.sessionStorage))
  auth: Auth | null = null;

  // Store user-selected org slug in local storage so that
  // it persists between sessions
  @options(persist(window.localStorage))
  orgSlug: string | null = null;

  // Slug lookup for non-superadmins
  // Superadmins have access to the `GET orgs/slug-lookup` endpoint
  get slugLookup(): SlugLookup | null {
    if (this.userInfo) {
      const slugLookup = this.userInfo.orgs.reduce(
        (acc, org) => ({
          ...acc,
          [org.id]: org.slug,
        }),
        {},
      );
      return slugLookup;
    }

    return null;
  }
}

export function makeAppStateService() {
  // Prevent state updates from any component
  const { state, unlock } = locked();

  @state()
  class LockedAppState extends AppState {}

  const appState = new LockedAppState();

  class AppStateService {
    get appState() {
      return appState;
    }

    updateSettings = (settings: AppState["settings"]) => {
      unlock(() => {
        appState.settings = settings;
      });
    };
    updateAuth = (authState: AppState["auth"]) => {
      unlock(() => {
        authSchema.nullable().parse(authState);

        appState.auth = authState;
      });
    };
    updateUserInfo = (userInfo: AppState["userInfo"]) => {
      unlock(() => {
        userInfoSchema.nullable().parse(userInfo);

        appState.userInfo = userInfo;
      });
    };
    updateOrg = (org: AppState["org"]) => {
      unlock(() => {
        appState.org = org;
      });
    };
    partialUpdateOrg = (org: { id: string } & Partial<OrgData>) => {
      unlock(() => {
        if (org.id && appState.org?.id === org.id) {
          appState.org = {
            ...appState.org,
            ...org,
          };
        } else {
          console.warn("no matching org in app state");
        }
      });
    };
    updateOrgSlug = (orgSlug: AppState["orgSlug"]) => {
      unlock(() => {
        appState.orgSlug = orgSlug;
      });
    };
    resetAll = () => {
      unlock(() => {
        appState.settings = null;
        appState.org = undefined;
      });
      this.resetUser();
    };
    resetUser = () => {
      unlock(() => {
        appState.auth = null;
        appState.userInfo = null;
        appState.orgSlug = null;
      });
    };
  }

  return new AppStateService();
}

const AppStateService = makeAppStateService();

export { AppStateService };
export default AppStateService.appState;
