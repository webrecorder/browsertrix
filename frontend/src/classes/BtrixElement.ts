import { TailwindElement } from "./TailwindElement";

import appState, { use } from "@/utils/state";

export class BtrixElement extends TailwindElement {
  /** Access and react to updates to shared state */
  @use()
  appState = appState;

  protected get authState() {
    return this.appState.auth;
  }

  protected get userInfo() {
    return this.appState.userInfo;
  }

  protected get org() {
    return this.appState.org;
  }
}
