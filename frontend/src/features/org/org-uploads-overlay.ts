import { consume } from "@lit/context";
import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import orgUploadsContext, {
  type OrgUploadsContext,
} from "@/context/org-uploads";

@customElement("btrix-org-uploads-overlay")
@localized()
export class OrgUploadsOverlay extends BtrixElement {
  @consume({ context: orgUploadsContext, subscribe: true })
  private readonly orgUploads?: OrgUploadsContext;

  render() {
    console.log("this.orgUploads", this.orgUploads);
    return html``;
  }
}
