import { localized, msg } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { Action, type BtrixSelectActionEvent } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import { ClipboardController } from "@/controllers/clipboard";
import { WorkflowTab } from "@/routes";
import type { Crawl, ListWorkflow, Workflow } from "@/types/crawler";
import { isNotFailed, isSuccessfullyFinished } from "@/utils/crawler";
import { isArchivingDisabled } from "@/utils/orgs";

@customElement("btrix-workflow-action-menu")
@localized()
export class WorkflowActionMenu extends BtrixElement {
  @property({ type: Object })
  workflow?: ListWorkflow | Workflow;

  @property({ type: Object })
  latestCrawl?: Crawl | null;

  @property({ type: Object })
  logTotals?: { errors: number; behaviors: number } | null;

  @property({ type: Boolean })
  hidePauseResume?: boolean;

  @property({ type: Boolean })
  disablePauseResume?: boolean;

  @property({ type: Boolean })
  cancelingRun?: boolean;

  render() {
    const workflow = this.workflow;

    if (!workflow) return;

    const canCrawl = this.appState.isCrawler;
    const archivingDisabled = isArchivingDisabled(this.org, true);
    const paused = workflow.lastCrawlState === "paused";
    const crawling =
      workflow.isCrawlRunning &&
      !workflow.lastCrawlStopping &&
      !workflow.lastCrawlShouldPause &&
      workflow.lastCrawlState === "running";

    return html`<sl-menu
      @sl-select=${(e: SlSelectEvent) => {
        e.stopPropagation();
        const action = e.detail.item.dataset["action"];

        this.dispatchEvent(
          new CustomEvent<BtrixSelectActionEvent["detail"]>("btrix-select", {
            detail: { item: { ...e.detail.item, action: action as Action } },
            bubbles: true,
            composed: true,
          }),
        );
      }}
    >
      ${when(
        canCrawl,
        () =>
          html`${when(
              workflow.isCrawlRunning,
              () => html`
                ${when(
                  !this.hidePauseResume &&
                    !this.disablePauseResume &&
                    !this.cancelingRun,
                  () =>
                    paused
                      ? html`
                          <sl-menu-item
                            data-action=${Action.TogglePauseResume}
                            class="menu-item-success"
                            ?disabled=${workflow.lastCrawlStopping}
                          >
                            <sl-icon name="play-circle" slot="prefix"></sl-icon>
                            ${msg("Resume Crawl")}
                          </sl-menu-item>
                        `
                      : html`
                          <sl-menu-item
                            data-action=${Action.TogglePauseResume}
                            ?disabled=${workflow.lastCrawlStopping}
                          >
                            <sl-icon
                              name="pause-circle"
                              slot="prefix"
                            ></sl-icon>
                            ${msg("Pause Crawl")}
                          </sl-menu-item>
                        `,
                )}

                <sl-menu-item
                  data-action=${Action.Stop}
                  ?disabled=${workflow.lastCrawlStopping || this.cancelingRun}
                >
                  <sl-icon name="dash-square" slot="prefix"></sl-icon>
                  ${msg("Stop Crawl")}
                </sl-menu-item>
                <sl-menu-item
                  data-action=${Action.Cancel}
                  class="menu-item-danger"
                  ?disabled=${this.cancelingRun}
                >
                  <sl-icon name="x-octagon" slot="prefix"></sl-icon>
                  ${msg(html`Cancel & Discard Crawl`)}
                </sl-menu-item>
              `,
              () => html`
                <sl-menu-item
                  data-action=${Action.Run}
                  class="menu-item-success"
                  ?disabled=${archivingDisabled}
                >
                  <sl-icon name="play" slot="prefix"></sl-icon>
                  ${msg("Run Crawl")}
                </sl-menu-item>
              `,
            )} <sl-divider></sl-divider>`,
      )}
      ${when(
        canCrawl,
        () =>
          html`${when(
              workflow.isCrawlRunning &&
                !workflow.lastCrawlStopping &&
                !this.cancelingRun,
              () => html`
                <sl-menu-item data-action=${Action.EditBrowserWindows}>
                  <sl-icon name="plus-slash-minus" slot="prefix"></sl-icon>
                  ${msg("Edit Browser Windows")}
                </sl-menu-item>
                <sl-menu-item
                  data-action=${Action.EditBrowserWindows}
                  ?disabled=${!crawling && !paused}
                >
                  <sl-icon name="table" slot="prefix"></sl-icon>
                  ${msg("Edit Exclusions")}
                </sl-menu-item>
              `,
            )}
            <sl-menu-item
              @click=${() =>
                this.navigate.to(
                  `/orgs/${this.appState.orgSlug}/workflows/${workflow.id}?edit`,
                )}
            >
              <sl-icon name="gear" slot="prefix"></sl-icon>
              ${msg("Edit Workflow Settings")}
            </sl-menu-item>
            <sl-menu-item
              data-action=${Action.Duplicate}
              ?disabled=${archivingDisabled}
            >
              <sl-icon name="files" slot="prefix"></sl-icon>
              ${msg("Duplicate Workflow")}
            </sl-menu-item>
            <sl-divider></sl-divider> `,
      )}
      ${when(
        this.latestCrawl && isNotFailed(this.latestCrawl),
        () => html`
          <sl-menu-item>
            <sl-icon slot="prefix" name="gear-wide-connected"></sl-icon>
            ${msg("Latest Crawl")}
            ${this.renderLatestCrawlMenu(this.latestCrawl!)}
          </sl-menu-item>
          <sl-divider></sl-divider>
        `,
      )}

      <sl-menu-item
        @click=${() =>
          ClipboardController.copyToClipboard(workflow.tags.join(", "))}
        ?disabled=${!workflow.tags.length}
      >
        <sl-icon name="tags" slot="prefix"></sl-icon>
        ${msg("Copy Tags")}
      </sl-menu-item>

      <sl-menu-item
        @click=${() => ClipboardController.copyToClipboard(workflow.id)}
      >
        <sl-icon name="copy" slot="prefix"></sl-icon>
        ${msg("Copy Workflow ID")}
      </sl-menu-item>

      ${when(
        canCrawl && !workflow.crawlCount,
        () => html`
          <sl-divider></sl-divider>
          <sl-menu-item data-action=${Action.Delete} class="menu-item-danger">
            <sl-icon name="trash3" slot="prefix"></sl-icon>
            ${msg("Delete Workflow")}
          </sl-menu-item>
        `,
      )}
    </sl-menu>`;
  }

  private renderLatestCrawlMenu(latestCrawl: Crawl) {
    const authToken = this.authState?.headers.Authorization.split(" ")[1];
    const logTotals = this.logTotals;

    return html`
      <sl-menu slot="submenu">
        <btrix-menu-item-link
          href=${`/api/orgs/${this.orgId}/all-crawls/${latestCrawl.id}/download?auth_bearer=${authToken}`}
          ?disabled=${!latestCrawl.fileSize}
          download
        >
          <sl-icon name="cloud-download" slot="prefix"></sl-icon>
          ${msg("Download Item")}
          ${latestCrawl.fileSize
            ? html` <btrix-badge
                slot="suffix"
                class="font-monostyle text-xs text-neutral-500"
                >${this.localize.bytes(latestCrawl.fileSize)}</btrix-badge
              >`
            : nothing}
        </btrix-menu-item-link>

        <btrix-menu-item-link
          href=${`/api/orgs/${this.orgId}/crawls/${latestCrawl.id}/logs?auth_bearer=${authToken}`}
          ?disabled=${!(logTotals?.errors || logTotals?.behaviors)}
          download
        >
          <sl-icon name="file-earmark-arrow-down" slot="prefix"></sl-icon>
          ${msg("Download Log")}
        </btrix-menu-item-link>

        ${when(
          isSuccessfullyFinished(latestCrawl),
          () => html`
            <sl-menu-item
              @click=${() =>
                this.navigate.to(
                  `${this.navigate.orgBasePath}/workflows/${latestCrawl.cid}/${WorkflowTab.Crawls}/${latestCrawl.id}`,
                )}
            >
              <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
              ${msg("View Item Details")}
            </sl-menu-item>
          `,
        )}
        <sl-menu-item
          @click=${() => ClipboardController.copyToClipboard(latestCrawl.id)}
        >
          <sl-icon name="copy" slot="prefix"></sl-icon>
          ${msg("Copy Item ID")}
        </sl-menu-item>
      </sl-menu>
    `;
  }
}
