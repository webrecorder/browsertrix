import type { TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import LiteElement, { html } from "../../utils/LiteElement";
import type { OrgData } from "../../utils/orgs";

@localized()
export class Dashboard extends LiteElement {
  @property({ type: String })
  orgId!: string;

  @property({ type: Object })
  org: OrgData | null = null;

  render() {
    return html`<header class="flex justify-between gap-2 pb-3 mb-7 border-b">
        <h1 class="min-w-0 text-xl font-semibold leading-8">
          ${this.org?.name}
        </h1>
      </header>
      <main>
        <div class="flex flex-col md:flex-row gap-6">
          ${this.renderCard(
            msg("Storage"),
            html`
              <div class="font-semibold mb-3">
                <sl-format-bytes value=${0}></sl-format-bytes> ${msg("Used")}
              </div>
              <dl>
                ${this.renderStat({
                  value: 0,
                  singleLabel: msg("Crawl"),
                  pluralLabel: msg("Crawls"),
                  icon: "gear-wide-connected",
                })}
                ${this.renderStat({
                  value: 0,
                  singleLabel: msg("Upload"),
                  pluralLabel: msg("Uploads"),
                  icon: "upload",
                })}
                ${this.renderStat({
                  value: 0,
                  singleLabel: msg("Browser Profile"),
                  pluralLabel: msg("Browser Profiles"),
                  icon: "window-fullscreen",
                })}
                ${this.renderStat({
                  value: 0,
                  singleLabel: msg("Total Page"),
                  pluralLabel: msg("Total Pages"),
                  icon: "file-richtext-fill",
                })}
              </dl>
            `
          )}
          ${this.renderCard(
            msg("Crawling"),
            html`
              <dl>
                ${this.renderStat({
                  value: 0,
                  singleLabel: msg("Crawl Running"),
                  pluralLabel: msg("Crawls Running"),
                  icon: "record-fill",
                })}
                ${this.renderStat({
                  value: 0,
                  singleLabel: msg("Crawl Workflow Waiting"),
                  pluralLabel: msg("Crawl Workflows Waiting"),
                  icon: "hourglass-split",
                })}
              </dl>
            `,
            html`
              <footer class="text-right">
                <sl-button
                  href=${`/orgs/${this.orgId}/workflows?new&jobType=`}
                  size="small"
                  @click=${this.navLink}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>${msg(
                    "New Workflow"
                  )}
                </sl-button>
              </footer>
            `
          )}
          ${this.renderCard(
            msg("Collections"),
            html`
              <dl>
                ${this.renderStat({
                  value: 0,
                  singleLabel: msg("Collection"),
                  pluralLabel: msg("Collections"),
                  icon: "collection-fill",
                })}
              </dl>
            `,
            html`
              <footer class="text-right">
                <sl-button
                  href=${`/orgs/${this.orgId}/collections/new`}
                  size="small"
                  @click=${this.navLink}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>${msg(
                    "New Collection"
                  )}
                </sl-button>
              </footer>
            `
          )}
        </div>
      </main> `;
  }

  private renderCard(
    title: string,
    content: TemplateResult,
    footer?: TemplateResult
  ) {
    return html`
      <section class="flex-1 flex flex-col border rounded p-4">
        <h2 class="text-lg font-semibold leading-none border-b pb-3 mb-3">
          ${title}
        </h2>
        <div class="flex-1">${content}</div>
        ${footer}
      </section>
    `;
  }

  private renderStat(stat: {
    value: number;
    singleLabel: string;
    pluralLabel: string;
    icon: string;
  }) {
    return html`
      <div class="flex items-center mb-2 last:mb-0">
        <sl-icon
          class="text-base text-neutral-500 mr-2"
          name=${stat.icon}
        ></sl-icon>
        <dt class="order-last">
          ${stat.value === 1 ? stat.singleLabel : stat.pluralLabel}
        </dt>
        <dd class="mr-1">${stat.value.toLocaleString()}</dd>
      </div>
    `;
  }
}
customElements.define("btrix-dashboard", Dashboard);
