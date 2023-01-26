import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { ViewState } from "../utils/APIRouter";
import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import type { OrgData } from "../utils/orgs";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import "./crawl-configs-detail";
import "./crawl-configs-list";
import "./crawl-configs-new";
import "./crawl-detail";
import "./crawls-list";
import "./browser-profiles-detail";
import "./browser-profiles-list";
import "./browser-profiles-new";
import "./org-settings";

export type OrgTab =
  | "crawls"
  | "crawl-configs"
  | "browser-profiles"
  | "settings";

const defaultTab = "crawls";

@needLogin
@localized()
export class Org extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Object })
  viewStateData?: ViewState["data"];

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  orgTab: OrgTab = defaultTab;

  @property({ type: String })
  browserProfileId?: string;

  @property({ type: String })
  browserId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ type: String })
  crawlConfigId?: string;

  @property({ type: Boolean })
  isAddingMember: boolean = false;

  @property({ type: Boolean })
  isEditing: boolean = false;

  /** Whether new resource is being added in tab */
  @property({ type: Boolean })
  isNewResourceTab: boolean = false;

  @state()
  private org?: OrgData | null;

  async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      try {
        const org = await this.getOrg(this.orgId);

        if (!org) {
          this.navTo("/orgs");
        } else {
          this.org = org;
        }
      } catch {
        this.org = null;

        this.notify({
          message: msg("Sorry, couldn't retrieve organization at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }
}
