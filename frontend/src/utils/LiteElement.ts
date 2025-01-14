import { html, LitElement } from "lit";

import appState, { use } from "./state";

import { APIController } from "@/controllers/api";
import { LocalizeController } from "@/controllers/localize";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";

export { html };

/**
 * @deprecated Use `BtrixElement` instead
 */
export default class LiteElement extends LitElement {
  @use()
  appState = appState;

  private readonly apiController = new APIController(this);
  private readonly notifyController = new NotifyController(this);
  private readonly navigateController = new NavigateController(this);
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

  protected get orgBasePath() {
    return this.navigateController.orgBasePath;
  }

  createRenderRoot() {
    return this;
  }

  /**
   * @deprecated New components should use NavigateController directly
   */
  navHandleAnchorClick = (
    ...args: Parameters<NavigateController["handleAnchorClick"]>
  ) => this.navigateController.handleAnchorClick(...args);

  /**
   * @deprecated New components should use NavigateController directly
   */
  navTo = (...args: Parameters<NavigateController["to"]>) =>
    this.navigateController.to(...args);

  /**
   * @deprecated New components should use NavigateController directly
   */
  navLink = (...args: Parameters<NavigateController["link"]>) =>
    this.navigateController.link(...args);

  /**
   * @deprecated New components should use NotifyController directly
   */
  notify = (...args: Parameters<NotifyController["toast"]>) =>
    this.notifyController.toast(...args);

  /**
   * @deprecated New components should use APIController directly
   */
  apiFetch = async <T = unknown>(...args: Parameters<APIController["fetch"]>) =>
    this.apiController.fetch<T>(...args);
}
