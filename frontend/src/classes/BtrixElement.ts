import { TailwindElement } from "./TailwindElement";

import { APIController } from "@/controllers/api";
import { LocalizeController } from "@/controllers/localize";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import { type FeatureFlags } from "@/types/featureFlags";
import appState, { use } from "@/utils/state";

export class BtrixElement extends TailwindElement {
  /** Access and react to updates to shared state */
  @use()
  appState = appState;

  readonly api = new APIController(this);
  readonly notify = new NotifyController(this);
  readonly navigate = new NavigateController(this);
  readonly localize = new LocalizeController(this);

  protected get authState() {
    return this.appState.auth;
  }

  protected get userInfo() {
    return this.appState.userInfo;
  }

  protected get userOrg() {
    return this.appState.userOrg;
  }

  protected get orgId() {
    return this.appState.orgId;
  }

  protected get orgSlugState() {
    return this.appState.orgSlug;
  }

  protected get org() {
    return this.appState.org;
  }

  protected get featureFlags() {
    return {
      has: (flag: FeatureFlags) => this.org?.featureFlags[flag] ?? false,
    };
  }
}
