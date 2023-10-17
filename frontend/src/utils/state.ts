/**
 * Store and access application-wide state
 */
import { state, use } from "lit-shared-state";

import type { CurrentUser } from "../types/user";

export { use };

// Keyed by org ID
type SlugLookup = Record<string, string>;

@state()
class AppState {
  orgSlug: string | null = null;
  userInfo: CurrentUser | null = null;

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

  reset() {
    this.orgSlug = null;
    this.userInfo = null;
  }
}

const appState = new AppState();

export default appState;
