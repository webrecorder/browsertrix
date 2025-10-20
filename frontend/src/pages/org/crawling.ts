import { localized, msg } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { ScopeType } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import type { SelectJobTypeEvent } from "@/features/crawl-workflows/new-workflow-dialog";
import { pageHeader } from "@/layouts/pageHeader";
import { OrgTab, WorkflowTab } from "@/routes";
import scopeTypeLabels from "@/strings/crawl-workflows/scopeType";
import { NewWorkflowOnlyScopeType } from "@/types/workflow";
import { tw } from "@/utils/tailwind";

@customElement("btrix-org-crawling")
@localized()
export class OrgCrawling extends BtrixElement {
  @property({ type: String })
  crawlingTab?: string;

  render() {
    return html`
      ${pageHeader({
        title: msg("Crawling"),
        actions: html`
          ${when(
            this.appState.isAdmin,
            () =>
              html`<sl-tooltip content=${msg("Configure crawling defaults")}>
                <sl-icon-button
                  href=${`${this.navigate.orgBasePath}/settings/crawling-defaults`}
                  class="size-8 text-lg"
                  name="gear"
                  label=${msg("Edit org crawling settings")}
                  @click=${this.navigate.link}
                ></sl-icon-button>
              </sl-tooltip>`,
          )}
          ${when(
            this.appState.isCrawler,
            () => html`
              <sl-button-group>
                <sl-button
                  variant="primary"
                  size="small"
                  ?disabled=${this.org?.readOnly}
                  @click=${() =>
                    this.navigate.to(
                      `${this.navigate.orgBasePath}/workflows/new`,
                      {
                        scopeType:
                          this.appState.userPreferences?.newWorkflowScopeType,
                      },
                    )}
                >
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  ${msg("New Workflow")}</sl-button
                >
                <sl-dropdown
                  distance="4"
                  placement="bottom-end"
                  @sl-select=${(e: SlSelectEvent) => {
                    const { value } = e.detail.item;

                    if (value) {
                      this.dispatchEvent(
                        new CustomEvent<SelectJobTypeEvent["detail"]>(
                          "select-job-type",
                          {
                            detail: value as SelectJobTypeEvent["detail"],
                          },
                        ),
                      );
                    }
                  }}
                >
                  <sl-button
                    slot="trigger"
                    size="small"
                    variant="primary"
                    caret
                    ?disabled=${this.org?.readOnly}
                  >
                    <sl-visually-hidden
                      >${msg("Scope options")}</sl-visually-hidden
                    >
                  </sl-button>
                  <sl-menu>
                    <sl-menu-label> ${msg("Page Crawl")} </sl-menu-label>
                    <sl-menu-item value=${ScopeType.Page}
                      >${scopeTypeLabels[ScopeType.Page]}</sl-menu-item
                    >
                    <sl-menu-item value=${NewWorkflowOnlyScopeType.PageList}>
                      ${scopeTypeLabels[NewWorkflowOnlyScopeType.PageList]}
                    </sl-menu-item>
                    <sl-menu-item value=${ScopeType.SPA}>
                      ${scopeTypeLabels[ScopeType.SPA]}
                    </sl-menu-item>
                    <sl-divider></sl-divider>
                    <sl-menu-label>${msg("Site Crawl")}</sl-menu-label>
                    <sl-menu-item value=${ScopeType.Prefix}>
                      ${scopeTypeLabels[ScopeType.Prefix]}
                    </sl-menu-item>
                    <sl-menu-item value=${ScopeType.Host}>
                      ${scopeTypeLabels[ScopeType.Host]}
                    </sl-menu-item>
                    <sl-menu-item value=${ScopeType.Domain}>
                      ${scopeTypeLabels[ScopeType.Domain]}
                    </sl-menu-item>
                    <sl-menu-item value=${ScopeType.Custom}>
                      ${scopeTypeLabels[ScopeType.Custom]}
                    </sl-menu-item>
                  </sl-menu>
                </sl-dropdown>
              </sl-button-group>
            `,
          )}
        `,
        classNames: tw`mb-3`,
      })}
      <div class="mb-3 flex gap-2">
        <btrix-navigation-button
          href=${`${this.navigate.orgBasePath}/${OrgTab.Workflows}`}
          @click=${this.navigate.link}
          size="small"
          ?active=${!this.crawlingTab}
        >
          <sl-icon name="file-code-fill"></sl-icon>
          <span>${msg("Workflows")}</span>
        </btrix-navigation-button>
        <btrix-navigation-button
          href=${`${this.navigate.orgBasePath}/${OrgTab.Workflows}/${WorkflowTab.Crawls}`}
          @click=${this.navigate.link}
          size="small"
          ?active=${this.crawlingTab === WorkflowTab.Crawls}
        >
          <sl-icon name="gear-wide-connected"></sl-icon>
          <span>${msg("Crawl Runs")}</span>
        </btrix-navigation-button>
      </div>

      ${when(
        this.crawlingTab === WorkflowTab.Crawls,
        () => html`<btrix-org-crawls></btrix-org-crawls>`,
        () => html`<btrix-workflows-list></btrix-workflows-list>`,
      )}
    `;
  }
}
