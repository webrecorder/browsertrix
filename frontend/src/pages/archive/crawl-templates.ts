import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import type { ArchiveData } from "../../utils/archives";
import LiteElement, { html } from "../../utils/LiteElement";

type CrawlTemplate = {};

@localized()
export class CrawlTemplates extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: Boolean })
  isNew!: Boolean;

  @property({ type: Array })
  crawlTemplates?: CrawlTemplate[];

  render() {
    if (this.isNew) {
      return this.renderNew();
    }

    return this.renderList();
  }

  private renderNew() {
    return html`
      <h2 class="text-xl font-bold">${msg("New Crawl Template")}</h2>

      <main>
        <sl-form>
          <div class="border rounded-lg md:grid grid-cols-4">
            <div class="col-span-1 p-4 md:p-8 md:border-b">
              <h3 class="text-lg font-medium">${msg("Basic settings")}</h3>
            </div>
            <div class="col-span-3 p-4 md:p-8 border-b">
              <div class="mb-5">
                <sl-input
                  name="name"
                  label=${msg("Name")}
                  placeholder=${msg("Example (example.com) Weekly Crawl", {
                    desc: "Example crawl template name",
                  })}
                  autocomplete="off"
                  required
                ></sl-input>
              </div>
              <div class="mb-5">
                <sl-switch name="runNow" required
                  >${msg("Run manually")}</sl-switch
                >
              </div>

              <div class="mb-5 flex items-end">
                <!-- TODO fix input alignment -->
                <div class="w-60 mr-2">
                  <sl-select name="scheduleFrequency" label=${msg("Schedule")}>
                    <sl-menu-item value="daily">Daily</sl-menu-item>
                    <sl-menu-item value="weekly">Weekly</sl-menu-item>
                    <sl-menu-item value="monthly">Monthly</sl-menu-item>
                  </sl-select>
                </div>
                <div>
                  <btrix-input
                    name="scheduleTime"
                    type="time"
                    placeholder=${msg("12:00 PM", {
                      desc: "Example crawl template time",
                    })}
                  ></btrix-input>
                </div>
              </div>

              <div class="mb-5">
                <sl-input
                  name="crawlTimeout"
                  label=${msg("Time limit")}
                  type="number"
                ></sl-input>
              </div>
            </div>

            <div class="p-4 md:p-8">
              <sl-button type="primary" submit
                >${msg("Create Template")}</sl-button
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
        <sl-button>
          <sl-icon slot="prefix" name="plus-square-dotted"></sl-icon>
          ${msg("Create new crawl template")}
        </sl-button>
      </div>
    `;
  }
}
