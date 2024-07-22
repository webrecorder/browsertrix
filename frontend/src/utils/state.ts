/**
 * Store and access application-wide state
 */
import { locked, options, use } from "lit-shared-state";

import { persist } from "./persist";

import type { AppSettings } from "@/types/app";
import type { OrgData } from "@/types/org";
import type { CurrentUser } from "@/types/user";

export { use };

// Prevent state updates from any component
const { state, unlock } = locked();

// Keyed by org ID
type SlugLookup = Record<string, string>;

@state()
class AppState {
  settings: AppSettings | null = null;
  userInfo: CurrentUser | null = null;
  org?: OrgData | null;

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

const appState = new AppState();

export default appState;

export class AppStateService {
  static updateSettings = (settings: AppState["settings"]) => {
    unlock(() => {
      appState.settings = settings;
    });
  };
  static updateUserInfo = (userInfo: AppState["userInfo"]) => {
    unlock(() => {
      appState.userInfo = userInfo;
    });
  };
  static updateOrg = (org: AppState["org"]) => {
    unlock(() => {
      appState.org = org;
    });
  };
  static patchOrg = (org: Partial<OrgData>) => {
    unlock(() => {
      if (!appState.org) {
        throw new Error("no org in app state");
      }
      appState.org = {
        ...appState.org,
        ...org,
      };
    });
  };
  static updateOrgSlug = (orgSlug: AppState["orgSlug"]) => {
    unlock(() => {
      appState.orgSlug = orgSlug;
    });
  };
  static resetAll = () => {
    unlock(() => {
      appState.settings = null;
    });
    AppStateService.resetUser();
  };
  static resetUser = () => {
    unlock(() => {
      appState.userInfo = null;
      appState.orgSlug = null;
    });
  };
}
