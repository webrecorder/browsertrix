import { localized } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { pageHeader } from "@/layouts/pageHeader";

type PublicOrg = {
  name: string;
};

@localized()
@customElement("btrix-org-home")
export class OrgHome extends BtrixElement {
  @state()
  private readonly collections = [];

  readonly publicOrg = new Task(this, {
    autoRun: false,
    task: async ([slug]) => {
      if (!slug) return;
      const org = await this.getOrg(slug);
      return org;
    },
    args: () => [this.orgSlug] as const,
  });

  protected firstUpdated(): void {
    if (this.authState) {
      // Redirect to dashboard if logged in
      this.navigate.to(`${this.navigate.orgBasePath}/dashboard`);
    } else {
      // Check if public org data is available
      void this.publicOrg.run();
    }
  }

  render() {
    return html`
      <div
        class="mx-auto box-border flex min-h-full max-w-screen-desktop flex-col p-3"
      >
        ${this.publicOrg.render({
          complete: (org) =>
            org ? this.renderOrg(org) : this.renderNotFound(),
          error: this.renderNotFound,
        })}
      </div>
    `;
  }

  private renderOrg(org: PublicOrg) {
    return html`
      <btrix-document-title title=${ifDefined(org.name)}></btrix-document-title>

      ${pageHeader(org.name)}
    `;
  }

  private renderNotFound() {
    return html`
      <div class="flex flex-1 items-center justify-center p-12">
        <btrix-not-found></btrix-not-found>
      </div>
    `;
  }

  private async getOrg(slug: BtrixElement["orgSlug"]): Promise<PublicOrg> {
    console.log(slug);
    return Promise.reject();
    // return Promise.resolve({
    //   name: "Fake Org Name",
    // });
  }
}
