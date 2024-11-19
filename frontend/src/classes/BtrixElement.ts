import { TailwindElement } from "./TailwindElement";

import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import localize from "@/utils/localize";
import appState, { use } from "@/utils/state";

export class BtrixElement extends TailwindElement {
  /** Access and react to updates to shared state */
  @use()
  appState = appState;

  readonly api = new APIController(this);
  readonly notify = new NotifyController(this);
  readonly navigate = new NavigateController(this);
  readonly localize = localize;

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

  protected get orgSlug() {
    return this.appState.orgSlug;
  }

  protected get org() {
    return this.appState.org;
  }
}
