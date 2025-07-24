/**
 * Display list of workflows
 *
 * Usage example:
 * ```ts
 * <btrix-workflow-list>
 *   <btrix-workflow-list-item .workflow=${workflow1}>
 *   </btrix-workflow-list-item>
 *   <btrix-workflow-list-item .workflow=${workflow2}>
 *   </btrix-workflow-list-item>
 * </btrix-workflow-list>
 * ```
 */
import { localized, msg, str } from "@lit/localize";
import { css, html, LitElement, type TemplateResult } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
} from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import { WorkflowTab } from "@/routes";
import { noData } from "@/strings/ui";
import type { ListWorkflow } from "@/types/crawler";
import { humanizeSchedule } from "@/utils/cron";
import { srOnly, truncate } from "@/utils/css";
import { pluralOf } from "@/utils/pluralize";

// postcss-lit-disable-next-line
const mediumBreakpointCss = css`30rem`;
// postcss-lit-disable-next-line
const largeBreakpointCss = css`60rem`;
// postcss-lit-disable-next-line
const rowCss = css`
  .row {
    display: grid;
    grid-template-columns: 1fr;
  }

  @media only screen and (min-width: ${mediumBreakpointCss}) {
    .row {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media only screen and (min-width: ${largeBreakpointCss}) {
    .row {
      grid-template-columns: 1fr 17rem 10rem 11rem 3rem;
    }
  }

  .col {
    grid-column: span 1 / span 1;
  }
`;
const columnCss = css`
  .col:not(.action) {
    padding-left: var(--sl-spacing-small);
    padding-right: var(--sl-spacing-small);
  }

  .col:first-child {
    padding-left: var(--sl-spacing-medium);
  }
`;
// Shared custom variables
const hostVars = css`
  :host {
    --row-offset: var(--sl-spacing-x-small);
  }
`;

const shortDate = (date: string) => html`
  <btrix-format-date
    date=${date}
    month="2-digit"
    day="2-digit"
    year="numeric"
    hour="2-digit"
    minute="2-digit"
  ></btrix-format-date>
`;
const longDate = (date: string) => html`
  <btrix-format-date
    date=${date}
    month="long"
    day="numeric"
    year="numeric"
    hour="2-digit"
    minute="2-digit"
    time-zone-name="short"
  ></btrix-format-date>
`;

const notSpecified = html`<span class="notSpecified" role="presentation"
  >${noData}</span
>`;

@customElement("btrix-workflow-list-item")
@localized()
export class WorkflowListItem extends BtrixElement {
  static styles = [
    truncate,
    rowCss,
    columnCss,
    hostVars,
    css`
      a {
        all: unset;
      }

      .item {
        cursor: pointer;
        transition-property: background-color, box-shadow, margin;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        overflow: hidden;
      }

      .item:hover,
      .item:focus,
      .item:focus-within {
        background-color: var(--sl-color-neutral-50);
      }

      .item:hover {
        background-color: var(--sl-color-neutral-50);
        margin-left: calc(-1 * var(--row-offset));
        margin-right: calc(-1 * var(--row-offset));
      }

      .item:hover .col:nth-child(n + 2) {
        margin-left: calc(-1 * var(--row-offset));
      }

      .item:hover .col.action {
        margin-left: calc(-2 * var(--row-offset));
      }

      .row {
        border: 1px solid var(--sl-panel-border-color);
        border-radius: var(--sl-border-radius-medium);
        box-shadow: var(--sl-shadow-x-small);
      }

      .row:hover {
        box-shadow: var(--sl-shadow-small);
      }

      .col {
        padding-top: var(--sl-spacing-small);
        padding-bottom: var(--sl-spacing-small);
        transition-property: margin;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
        overflow: hidden;
      }

      .detail {
        color: var(--sl-color-neutral-700);
        font-size: var(--sl-font-size-medium);
        text-overflow: ellipsis;
        height: 1.5rem;
      }

      .desc {
        color: var(--sl-color-neutral-500);
        font-size: var(--sl-font-size-x-small);
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
        height: 1rem;
      }

      .notSpecified {
        color: var(--sl-color-neutral-400);
      }

      .url {
        display: flex;
      }

      .url .primaryUrl {
        flex: 0 1 auto;
      }

      .url .additionalUrls {
        flex: none;
        margin-left: var(--sl-spacing-2x-small);
      }

      .primaryUrl {
        word-break: break-all;
      }

      .additionalUrls {
        color: var(--sl-color-neutral-500);
      }

      .currCrawlSize {
        color: var(--success);
      }

      .duration {
        margin-left: calc(1rem + var(--sl-spacing-x-small));
      }

      .userName {
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
      }

      .action {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      @media only screen and (min-width: ${largeBreakpointCss}) {
        .action {
          border-left: 1px solid var(--sl-panel-border-color);
        }
      }
    `,
  ];

  @property({ type: Object })
  workflow?: ListWorkflow;

  @query(".row")
  row!: HTMLElement;

  @query("btrix-overflow-dropdown")
  dropdownMenu!: OverflowDropdown;

  render() {
    return html`<div
      class="item row"
      role="button"
      @click=${async (e: MouseEvent) => {
        if (e.target === this.dropdownMenu) {
          return;
        }
        e.preventDefault();
        await this.updateComplete;
        const failedStates = ["failed", "failed_not_logged_in"];
        const href = `/orgs/${this.orgSlugState}/workflows/${this.workflow?.id}/${failedStates.includes(this.workflow?.lastCrawlState || "") ? WorkflowTab.Logs : WorkflowTab.LatestCrawl}`;
        this.navigate.to(href);
      }}
    >
      <div class="col">
        <div class="detail url truncate">
          ${this.safeRender(this.renderName)}
        </div>
        <div class="desc">
          ${this.safeRender((workflow) => {
            if (workflow.schedule) {
              return humanizeSchedule(workflow.schedule, {
                length: "short",
              });
            }
            if (workflow.lastStartedByName) {
              return msg(str`Manual run by ${workflow.lastStartedByName}`);
            }
            return msg("---");
          })}
        </div>
      </div>
      <div class="col">${this.safeRender(this.renderLatestCrawl)}</div>
      <div class="col">
        <div class="detail">
          ${this.safeRender((workflow) => {
            if (
              workflow.isCrawlRunning &&
              workflow.totalSize &&
              workflow.lastCrawlSize
            ) {
              return html`${this.localize.bytes(+workflow.totalSize, {
                  unitDisplay: "narrow",
                })}
                <span class="currCrawlSize">
                  +
                  ${this.localize.bytes(workflow.lastCrawlSize, {
                    unitDisplay: "narrow",
                  })}
                </span>`;
            }
            if (workflow.totalSize && workflow.lastCrawlSize) {
              return this.localize.bytes(+workflow.totalSize, {
                unitDisplay: "narrow",
              });
            }
            if (workflow.isCrawlRunning && workflow.lastCrawlSize) {
              return html`<span class="currCrawlSize">
                ${this.localize.bytes(workflow.lastCrawlSize, {
                  unitDisplay: "narrow",
                })}
              </span>`;
            }
            if (workflow.totalSize) {
              return this.localize.bytes(+workflow.totalSize, {
                unitDisplay: "narrow",
              });
            }
            return notSpecified;
          })}
        </div>
        <div class="desc">
          ${this.safeRender(
            (workflow) =>
              `${this.localize.number(workflow.crawlCount, { notation: "compact" })} ${pluralOf("crawls", workflow.crawlCount)}`,
          )}
        </div>
      </div>
      <div class="col">${this.safeRender(this.renderModifiedBy)}</div>
      <div class="col action">
        <btrix-overflow-dropdown>
          <slot
            name="menu"
            @click=${(e: MouseEvent) => {
              // Prevent navigation to detail view
              e.preventDefault();
              e.stopPropagation();
            }}
          ></slot>
        </btrix-overflow-dropdown>
      </div>
    </div>`;
  }

  private readonly renderLatestCrawl = (workflow: ListWorkflow) => {
    let tooltipContent: TemplateResult | null = null;

    const status = html`
      <btrix-crawl-status
        state=${workflow.lastCrawlState || msg("No Crawls Yet")}
        ?stopping=${workflow.lastCrawlStopping}
        ?shouldPause=${workflow.lastCrawlShouldPause}
      ></btrix-crawl-status>
    `;

    const renderDuration = () => {
      const compactIn = (dur: number) => {
        const compactDuration = this.localize.humanizeDuration(dur, {
          compact: true,
        });
        return `${msg("in")} ${compactDuration}`;
      };
      const verboseIn = (dur: number) => {
        const verboseDuration = this.localize.humanizeDuration(dur, {
          verbose: true,
          unitCount: 2,
        });
        return `${msg("in")} ${verboseDuration}`;
      };
      const compactFor = (dur: number) => {
        const compactDuration = this.localize.humanizeDuration(dur, {
          compact: true,
        });
        return `${msg("for")} ${compactDuration}`;
      };
      const verboseFor = (dur: number) => {
        const verboseDuration = this.localize.humanizeDuration(dur, {
          verbose: true,
          unitCount: 2,
        });
        return msg(str`for ${verboseDuration}`, {
          desc: "`verboseDuration` example: '2 hours, 15 seconds'",
        });
      };

      if (workflow.lastCrawlTime && workflow.lastCrawlStartTime) {
        const diff =
          new Date(workflow.lastCrawlTime).valueOf() -
          new Date(workflow.lastCrawlStartTime).valueOf();

        tooltipContent = html`
          <span slot="content">
            ${msg("Finished")} ${longDate(workflow.lastCrawlTime)}
            ${verboseIn(diff)}
          </span>
        `;

        return html`${shortDate(workflow.lastCrawlTime)} ${compactIn(diff)}`;
      }

      if (workflow.lastCrawlStartTime) {
        const latestDate =
          workflow.lastCrawlShouldPause && workflow.lastCrawlPausedAt
            ? new Date(workflow.lastCrawlPausedAt)
            : new Date();
        const diff =
          latestDate.valueOf() -
          new Date(workflow.lastCrawlStartTime).valueOf();
        if (diff < 1000) {
          return "";
        }

        if (
          workflow.lastCrawlState === "paused" &&
          workflow.lastCrawlPausedAt
        ) {
          const pausedDiff =
            new Date().valueOf() -
            new Date(workflow.lastCrawlPausedAt).valueOf();
          tooltipContent = html`
            <span slot="content">
              ${msg("Crawl paused on")} ${longDate(workflow.lastCrawlPausedAt)}
            </span>
          `;

          return html`
            ${shortDate(workflow.lastCrawlPausedAt)} ${compactFor(pausedDiff)}
          `;
        }

        tooltipContent = html`
          <span slot="content">
            ${msg("Running")} ${verboseFor(diff)} ${msg("since")}
            ${longDate(workflow.lastCrawlStartTime)}
          </span>
        `;

        return html`${msg("Running")} ${compactFor(diff)}`;
      }
      return notSpecified;
    };

    const duration = renderDuration();

    return html`
      <sl-tooltip hoist placement="bottom" ?disabled=${!tooltipContent}>
        <div>
          <div class="detail">${status}</div>
          <div class="desc duration">${duration}</div>
        </div>

        ${tooltipContent}
      </sl-tooltip>
    `;
  };

  private readonly renderModifiedBy = (workflow: ListWorkflow) => {
    const date = longDate(workflow.modified);

    return html`
      <sl-tooltip hoist placement="bottom">
        <div>
          <div class="detail truncate">
            <span class="userName">${workflow.modifiedByName}</span>
          </div>
          <div class="desc">${shortDate(workflow.modified)}</div>
        </div>

        <span slot="content">
          ${workflow.modified === workflow.created
            ? msg("Created by")
            : msg("Edited by")}
          ${workflow.modifiedByName}
          ${msg(html`on ${date}`, {
            desc: "`date` example: 'January 1st, 2025 at 05:00 PM EST'",
          })}
        </span>
      </sl-tooltip>
    `;
  };

  private safeRender(
    render: (workflow: ListWorkflow) => string | TemplateResult<1>,
  ) {
    if (!this.workflow) {
      return html`<sl-skeleton></sl-skeleton>`;
    }
    return render(this.workflow);
  }

  // TODO consolidate collections/workflow name
  private readonly renderName = (workflow: ListWorkflow) => {
    if (workflow.name)
      return html`<span class="truncate">${workflow.name}</span>`;
    if (!workflow.firstSeed)
      return html`<span class="truncate">${workflow.id}</span>`;
    const remainder = workflow.seedCount - 1;
    let nameSuffix: string | TemplateResult<1> = "";
    if (remainder) {
      nameSuffix = html`<span class="additionalUrls"
        >+${this.localize.number(remainder, { notation: "compact" })}
        ${pluralOf("URLs", remainder)}</span
      >`;
    }
    return html`
      <span class="primaryUrl truncate">${workflow.firstSeed}</span
      >${nameSuffix}
    `;
  };
}

@customElement("btrix-workflow-list")
@localized()
export class WorkflowList extends LitElement {
  static styles = [
    srOnly,
    rowCss,
    columnCss,
    hostVars,
    css`
      .listHeader,
      .list {
        margin-left: var(--row-offset);
        margin-right: var(--row-offset);
      }

      .listHeader {
        line-height: 1;
      }

      .row {
        display: none;
        font-size: var(--sl-font-size-x-small);
        color: var(--sl-color-neutral-600);
      }

      .col {
        padding-top: var(--sl-spacing-x-small);
        padding-bottom: var(--sl-spacing-x-small);
      }

      @media only screen and (min-width: ${largeBreakpointCss}) {
        .row {
          display: grid;
        }
      }

      ::slotted(btrix-workflow-list-item) {
        display: block;
      }

      ::slotted(btrix-workflow-list-item:not(:last-of-type)) {
        margin-bottom: var(--sl-spacing-x-small);
      }
    `,
  ];

  @queryAssignedElements({ selector: "btrix-workflow-list-item" })
  listItems!: HTMLElement[];

  render() {
    return html` <div class="listHeader row">
        <div class="col">${msg(html`Name & Schedule`)}</div>
        <div class="col">${msg("Latest Crawl")}</div>
        <div class="col">${msg("Total Size")}</div>
        <div class="col">${msg("Last Modified")}</div>
        <div class="col action">
          <span class="srOnly">${msg("Actions")}</span>
        </div>
      </div>
      <div class="list" role="list">
        <slot @slotchange=${this.handleSlotchange}></slot>
      </div>`;
  }

  private handleSlotchange() {
    this.listItems.map((el) => {
      if (!el.attributes.getNamedItem("role")) {
        el.setAttribute("role", "listitem");
      }
    });
  }
}
