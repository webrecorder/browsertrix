import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

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
@customElement("btrix-org-home")
export class OrgHome extends BtrixElement {
  @state()
  private readonly collections: PublicCollection[] = [
    {
      name: "Fake Collection 1",
      description: "This is my fake collection used for testing.",
      thumbnailSrc:
        "https://webrecorder.net/_astro/replaywebpage.Bi6fWUjY_ZQsp0m.webp",
    },
    {
      name: "Fake Collection 2",
      description: "This is my fake collection used for testing.",
      thumbnailSrc:
        "https://webrecorder.net/_astro/replaywebpage.Bi6fWUjY_ZQsp0m.webp",
    },
    {
      name: "Fake Collection 3",
      description: "This is my fake collection used for testing.",
      thumbnailSrc:
        "https://webrecorder.net/_astro/replaywebpage.Bi6fWUjY_ZQsp0m.webp",
    },
    {
      name: "Fake Collection 4",
      description: "This is my fake collection used for testing.",
      thumbnailSrc:
        "https://webrecorder.net/_astro/replaywebpage.Bi6fWUjY_ZQsp0m.webp",
    },
    {
      name: "Fake Collection 5",
      description: "This is my fake collection used for testing.",
      thumbnailSrc:
        "https://webrecorder.net/_astro/replaywebpage.Bi6fWUjY_ZQsp0m.webp",
    },
    {
      name: "Fake Collection 6",
      description: "This is my fake collection used for testing.",
      thumbnailSrc:
        "https://webrecorder.net/_astro/replaywebpage.Bi6fWUjY_ZQsp0m.webp",
    },
  ];

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
        class="mx-auto box-border flex min-h-full max-w-screen-2xl flex-col p-3 lg:px-10"
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

      <h2 class="mb-5 mt-7 text-lg font-medium">${msg("Collections")}</h2>

      <ul
        class="mb-16 grid grid-cols-1 gap-x-10 gap-y-16 md:grid-cols-2 lg:grid-cols-4"
      >
        ${this.collections.map(
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
