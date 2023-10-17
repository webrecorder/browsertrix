/**
 * Store and access application-wide state
 */
import { use, locked } from "lit-shared-state";

import type { CurrentUser } from "../types/user";

export { use };

// Prevent state updates from any component
const { state, unlock } = locked();

// Keyed by org ID
type SlugLookup = Record<string, string>;

@state()
class AppState {
  userInfo: CurrentUser | null = null;
  orgSlug: string | null = null;

  get slugLookup(): SlugLookup | null {
    if (this.userInfo) {
      const slugLookup = this.userInfo.orgs.reduce(
        (acc, org) => ({
          ...acc,
          [org.id]: org.slug,
        }),
        {}
      );
      return slugLookup;
    }

    return null;
  }
}

const appState = new AppState();

export default appState;

export class AppStateService {
  static updateUserInfo = (userInfo: AppState["userInfo"]) => {
    unlock(() => {
      appState.userInfo = userInfo;
    });
  };
  static updateOrgSlug = (orgSlug: AppState["orgSlug"]) => {
    unlock(() => {
      appState.orgSlug = orgSlug;
    });
  };
  static reset = () => {
    unlock(() => {
      appState.userInfo = null;
      appState.orgSlug = null;
    });
  };
}
