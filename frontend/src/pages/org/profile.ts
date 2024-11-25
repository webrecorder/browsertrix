import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { pageHeader } from "@/layouts/pageHeader";

type PublicOrg = {
  name: string;
};

type PublicCollection = {
  name: string;
  description: string;
  thumbnailSrc: string;
};

@localized()
@customElement("btrix-org-profile")
export class OrgProfile extends BtrixElement {
  @property({ type: Boolean })
  preview = false;

  @state()
  private readonly collections: PublicCollection[] = [];

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
    if (this.authState && !this.preview) {
      // Redirect to dashboard if logged in
      this.navigate.to(`${this.navigate.orgBasePath}/dashboard`);
    } else {
      // Check if public org data is available
      void this.publicOrg.run();
    }
  }

  render() {
    return html`
      <div class="flex min-h-full flex-col">
        ${this.publicOrg.render({
          complete: (org) =>
            org ? this.renderOrg(org) : this.renderNotFound(),
          error: this.renderNotFound,
        })}
        ${this.renderSignUpCta()}
      </div>
    `;
  }

  private renderOrg(org: PublicOrg) {
    return html`
      <btrix-document-title title=${ifDefined(org.name)}></btrix-document-title>

      <div
        class="mx-auto box-border flex w-full max-w-screen-2xl flex-1 flex-col p-3 lg:px-10"
      >
        ${pageHeader(
          org.name,
          html`
            ${when(
              this.preview && this.appState.isAdmin,
              () =>
                html`<sl-tooltip content=${msg("Edit org info")}>
                  <sl-icon-button
                    href="${this.navigate.orgBasePath}/settings"
                    class="size-8 text-base"
                    name="pencil"
                    @click=${this.navigate.link}
                  ></sl-icon-button>
                </sl-tooltip>`,
            )}
          `,
        )}
        <header class="mb-5 mt-7 flex items-center justify-between">
          <h2 class="text-lg font-medium">${msg("Collections")}</h2>
          ${when(
            this.preview && this.appState.isAdmin,
            () =>
              html`<sl-tooltip content=${msg("Update collections settings")}>
                <sl-icon-button
                  href=${`${this.navigate.orgBasePath}/collections`}
                  class="size-8 text-base"
                  name="gear"
                  @click=${this.navigate.link}
                ></sl-icon-button>
              </sl-tooltip>`,
          )}
        </header>

        <div class="flex flex-1 items-center justify-center pb-16">
          ${this.renderCollections(this.collections)}
        </div>
      </div>
    `;
  }

  private renderCollections(collections: PublicCollection[]) {
    if (!collections.length) {
      return html`
        <p class="text-base text-neutral-500">
          ${msg("This org doesn't have any public collections yet.")}
        </p>
      `;
    }
    return html`
      <ul
        class="grid flex-1 grid-cols-1 gap-x-10 gap-y-16 md:grid-cols-2 lg:grid-cols-4"
      >
        ${collections.map(
          (collection) => html`
            <li class="col-span-1">
              <a
                href="#"
                class="group block rounded ring-[1rem] ring-white transition-all hover:scale-[102%] hover:bg-cyan-50 hover:ring-cyan-50"
              >
                <div class="mb-4">
                  <img
                    class="aspect-video rounded-lg border border-cyan-100 bg-slate-50 object-cover shadow-md shadow-cyan-900/20 transition-shadow group-hover:shadow-sm"
                    src=${collection.thumbnailSrc}
                  />
                </div>
                <div class="text-pretty leading-relaxed">
                  <strong
                    class="text-base font-medium text-stone-700 transition-colors group-hover:text-cyan-600"
                  >
                    ${collection.name}
                  </strong>
                  <p
                    class="text-stone-400 transition-colors group-hover:text-cyan-600"
                  >
                    ${collection.description}
                  </p>
                </div>
              </a>
            </li>
          `,
        )}
      </ul>
    `;
  }

  private renderSignUpCta() {
    const { signUpUrl } = this.appState.settings || {};

    if (!signUpUrl) return;

    return html`
      <div class="w-full border-y p-6 px-3 text-center text-neutral-500">
        <p>
          <span>
            ${msg(
              str`${this.publicOrg.value?.name} is sharing collections on Browsertrix.`,
            )}
          </span>
          <br />
          <span>${msg("Do you have collections to share?")}</span>
          <a
            class="group inline-flex items-center gap-1 font-medium text-cyan-400 transition-colors hover:text-cyan-500"
            href=${signUpUrl}
          >
            ${msg("Get started with Browsertrix")}
            <sl-icon
              slot="suffix"
              name="arrow-right"
              class="text-base transition-transform group-hover:translate-x-1"
            ></sl-icon>
          </a>
        </p>
      </div>
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
    // return Promise.reject();
    return Promise.resolve({
      name: "Fake Org Name",
    });
  }
}
