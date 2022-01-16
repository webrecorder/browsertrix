import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type CrawlTemplate = any; // TODO

const initialValues = {
  name: `Example crawl ${Date.now()}`, // TODO remove placeholder
  runNow: true,
  schedule: "@weekly",
  crawlTimeout: 0,
  seedUrls: "https://webrecorder.net", // TODO remove placeholder
  scopeType: "prefix",
  limit: 0,
};

@localized()
export class CrawlTemplates extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: Boolean })
  isNew!: boolean;

  @property({ type: Array })
  crawlTemplates?: CrawlTemplate[];

  @state()
  isRunNow: boolean = initialValues.runNow;

  render() {
    if (this.isNew) {
      return this.renderNew();
    }

    return this.renderList();
  }

  private renderNew() {
    return html`
      <h2 class="text-xl font-bold">${msg("New Crawl Template")}</h2>
      <p>
        ${msg(
          "Configure a new crawl template. You can choose to run a crawl immediately upon saving this template."
        )}
      </p>

      <main class="mt-4">
        <sl-form @sl-submit=${this.onSubmit}>
          <div class="border rounded-lg md:grid grid-cols-4">
            <div class="col-span-1 p-4 md:p-8 md:border-b">
              <h3 class="text-lg font-medium">${msg("Basic settings")}</h3>
            </div>
            <section class="col-span-3 p-4 md:p-8 border-b grid gap-5">
              <div>
                <sl-input
                  name="name"
                  label=${msg("Name")}
                  placeholder=${msg("Example (example.com) Weekly Crawl", {
                    desc: "Example crawl template name",
                  })}
                  autocomplete="off"
                  value=${initialValues.name}
                  required
                ></sl-input>
              </div>
              <div class="flex items-end">
                <!-- TODO schedule time -->
                <div>
                  <sl-select
                    name="schedule"
                    label=${msg("Schedule")}
                    value=${initialValues.schedule}
                  >
                    <sl-menu-item value="">None</sl-menu-item>
                    <sl-menu-item value="@daily">Daily</sl-menu-item>
                    <sl-menu-item value="@weekly">Weekly</sl-menu-item>
                    <sl-menu-item value="@monthly">Monthly</sl-menu-item>
                  </sl-select>
                </div>
                <!-- <div>
                  <btrix-input
                    name="scheduleTime"
                    type="time"
                  ></btrix-input>
                </div> -->
              </div>
              <div>
                <sl-switch
                  name="runNow"
                  ?checked=${initialValues.runNow}
                  @sl-change=${(e: any) => (this.isRunNow = e.target.checked)}
                  >${msg("Run immediately")}</sl-switch
                >
              </div>

              <div>
                <sl-input
                  name="crawlTimeout"
                  label=${msg("Time limit")}
                  type="number"
                  value=${initialValues.crawlTimeout}
                >
                  <span slot="suffix">${msg("seconds")}</span>
                </sl-input>
              </div>
            </section>

            <div class="col-span-1 p-4 md:p-8 md:border-b">
              <h3 class="text-lg font-medium">${msg("Pages")}</h3>
            </div>
            <section class="col-span-3 p-4 md:p-8 border-b">
              <h4 class="font-medium mb-3">${msg("Add URLs")}</h4>

              <div class="border rounded-lg p-4 md:p-6 grid gap-5">
                <div>
                  <sl-textarea
                    name="seedUrls"
                    label=${msg("Seed URLs")}
                    helpText=${msg("Separated by a new line, space or comma")}
                    placeholder=${msg(
                      `https://webrecorder.net\nhttps://example.com`,
                      {
                        desc: "Example seed URLs",
                      }
                    )}
                    rows="3"
                    value=${initialValues.seedUrls}
                    required
                  ></sl-textarea>
                </div>
                <div>
                  <sl-select
                    name="scopeType"
                    label=${msg("Scope type")}
                    value=${initialValues.scopeType}
                    required
                  >
                    <sl-menu-item value="page">Page</sl-menu-item>
                    <sl-menu-item value="page-spa">Page SPA</sl-menu-item>
                    <sl-menu-item value="prefix">Prefix</sl-menu-item>
                    <sl-menu-item value="host">Host</sl-menu-item>
                    <sl-menu-item value="any">Any</sl-menu-item>
                  </sl-select>
                </div>
                <div>
                  <sl-input
                    name="limit"
                    label=${msg("Page limit")}
                    type="number"
                    value=${initialValues.limit}
                    required
                  ></sl-input>
                </div>
              </div>
            </section>

            <div class="col-span-4 p-4 md:p-8 text-center">
              ${this.isRunNow
                ? html`
                    <p class="text-sm mb-3">
                      ${msg("A crawl will start immediately on save.")}
                    </p>
                  `
                : ""}

              <sl-button type="primary" submit
                >${msg("Save Crawl Template")}</sl-button
              >
            </div>
          </div>
        </sl-form>
      </main>
    `;
  }

  private renderList() {
    return html`
      <div class="text-center">
        <sl-button
          @click=${() =>
            this.navTo(`/archives/${this.archiveId}/crawl-templates/new`)}
        >
          <sl-icon slot="prefix" name="plus-square-dotted"></sl-icon>
          ${msg("Create new crawl template")}
        </sl-button>
      </div>

      <div>
        ${this.crawlTemplates?.map(
          (template) => html`<div>${template.id}</div>`
        )}
      </div>
    `;
  }

  private async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.authState) return;

    const { formData } = event.detail;

    const params = {
      name: formData.get("name"),
      schedule: formData.get("schedule"),
      runNow: this.isRunNow,
      config: {
        seeds: [
          {
            url: formData.get("seedUrls"),
            scopeType: formData.get("scopeType"),
            limit: formData.get("limit"),
          },
        ],
      },
      crawlTimeout: formData.get("crawlTimeout"),
    };

    console.log(params);

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/`,
        this.authState,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      console.debug("success");

      this.navTo(`/archives/${this.archiveId}/crawl-templates`);
    } catch (e) {
      console.error(e);
    }
  }
}
