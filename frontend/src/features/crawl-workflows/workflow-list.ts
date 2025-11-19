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
import { when } from "lit/directives/when.js";

import { ShareableNotice } from "./templates/shareable-notice";

import { BtrixElement } from "@/classes/BtrixElement";
import type { OverflowDropdown } from "@/components/ui/overflow-dropdown";
import { OrgTab, WorkflowTab } from "@/routes";
import { noData } from "@/strings/ui";
import type { ListWorkflow } from "@/types/crawler";
import { humanizeSchedule } from "@/utils/cron";
import { srOnly, truncate } from "@/utils/css";
import { pluralOf } from "@/utils/pluralize";

export type WorkflowColumnName =
  | "name"
  | "latest-crawl"
  | "total-crawls"
  | "modified"
  | "actions";

const columnWidths = {
  // TODO Consolidate with table.stylesheet.css
  // https://github.com/webrecorder/browsertrix/issues/3001
  name: "[clickable-start] minmax(18rem, 1fr)",
  "latest-crawl": "minmax(15rem, 18rem)",
  "total-crawls": "minmax(6rem, 9rem)",
  modified: "minmax(12rem, 15rem)",
  actions: "[clickable-end] 3rem",
} as const satisfies Record<WorkflowColumnName, string>;

// postcss-lit-disable-next-line
const largeBreakpointCss = css`60rem`;
// postcss-lit-disable-next-line
const rowCss = css`
  .row {
    display: grid;
    grid-template-columns: 1fr;
    position: relative;
  }

  .action {
    position: absolute;
    top: 0;
    right: 0;
  }

  @media only screen and (min-width: ${largeBreakpointCss}) {
    .row {
      grid-template-columns: var(--btrix-workflow-list-columns);
      white-space: nowrap;
    }

    .action {
      position: relative;
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

      /*
       * TODO Consolidate with table.stylesheet.css
       * https://github.com/webrecorder/browsertrix/issues/3001
       */
      .rowClickTarget--cell {
        display: grid;
        grid-template-columns: subgrid;
        white-space: nowrap;
        overflow: hidden;
      }

      .rowClickTarget {
        max-width: 100%;
      }

      .col sl-tooltip > *,
      .col btrix-popover > *,
      .col btrix-overflow-dropdown {
        /* Place above .rowClickTarget::after overlay */
        z-index: 10;
        position: relative;
      }

      .rowClickTarget::after {
        content: "";
        display: block;
        position: absolute;
        inset: 0;
        grid-column: clickable-start / clickable-end;
      }

      .rowClickTarget:focus-visible {
        outline: var(--sl-focus-ring);
        outline-offset: -0.25rem;
        border-radius: 0.5rem;
      }
    `,
  ];

  @property({ type: Object })
  workflow?: ListWorkflow;

  /**
   * Limit columns displayed
   * @TODO Convert to btrix-data-grid to make columns configurable
   */
  @property({ type: Array })
  columns?: WorkflowColumnName[];

  @query(".row")
  row!: HTMLElement;

  @query("btrix-overflow-dropdown")
  dropdownMenu!: OverflowDropdown;

  @query("a")
  private readonly anchor?: HTMLAnchorElement | null;

  private readonly columnTemplate = {
    name: () => {
      const href = `/orgs/${this.orgSlugState}/${OrgTab.Workflows}/${this.workflow?.id}/${this.workflow?.lastCrawlState?.startsWith("failed") ? WorkflowTab.Logs : WorkflowTab.LatestCrawl}`;

      return html`<div class="col rowClickTarget--cell">
        <a class="detail url rowClickTarget items-center truncate" href=${href}>
          ${when(this.workflow?.shareable, ShareableNotice)}
          ${this.safeRender(this.renderName)}
        </a>
        <div class="desc truncate">
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
      </div>`;
    },
    "latest-crawl": () =>
      html`<div class="col">${this.safeRender(this.renderLatestCrawl)}</div>`,
    "total-crawls": () =>
      html`<div class="col">
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
      </div>`,
    modified: () =>
      html`<div class="col">${this.safeRender(this.renderModifiedBy)}</div>`,
    actions: () =>
      html`<div class="col action">
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
      </div>`,
  } satisfies Record<WorkflowColumnName, () => TemplateResult>;

  render() {
    return html`<div class="item row">
      ${this.columns
        ? this.columns.map((col) => this.columnTemplate[col]())
        : Object.values(this.columnTemplate).map((render) => render())}
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
        <div class="w-max" @click=${this.redirectEventToAnchor}>
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
        <div class="w-max" @click=${this.redirectEventToAnchor}>
          <div class="detail truncate">
            ${workflow.modifiedByName
              ? html`<btrix-user-chip
                  userId=${workflow.modifiedBy}
                  userName=${workflow.modifiedByName}
                ></btrix-user-chip>`
              : notSpecified}
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

  /*
   * TODO Remove when refactored to `btrix-table`
   * https://github.com/webrecorder/browsertrix/issues/3001
   */
  private readonly redirectEventToAnchor = (e: MouseEvent) => {
    if (!e.defaultPrevented) {
      const newEvent = new MouseEvent(e.type, e);
      e.stopPropagation();

      this.anchor?.dispatchEvent(newEvent);
    }
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

  /**
   * Limit columns displayed
   * * @TODO Convert to btrix-data-grid to make columns configurable
   */
  @property({ type: Array, noAccessor: true })
  columns?: WorkflowColumnName[];

  @queryAssignedElements({ selector: "btrix-workflow-list-item" })
  listItems!: WorkflowListItem[];

  static ColumnTemplate = {
    name: html`<div class="col">${msg(html`Name & Schedule`)}</div>`,
    "latest-crawl": html`<div class="col">${msg("Latest Crawl")}</div>`,
    "total-crawls": html`<div class="col">${msg("Total Size")}</div>`,
    modified: html`<div class="col">${msg("Last Modified")}</div>`,
    actions: html`<div class="col action">
      <span class="srOnly">${msg("Actions")}</span>
    </div>`,
  } satisfies Record<WorkflowColumnName, TemplateResult>;

  connectedCallback(): void {
    this.style.setProperty(
      "--btrix-workflow-list-columns",
      this.columns?.map((col) => columnWidths[col]).join(" ") ||
        Object.values(columnWidths).join(" "),
    );

    super.connectedCallback();
  }

  render() {
    return html`<div class="listHeader row">
        ${this.columns
          ? this.columns.map((col) => WorkflowList.ColumnTemplate[col])
          : Object.values(WorkflowList.ColumnTemplate)}
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

      if (this.columns) {
        if (!el["columns"]) {
          el["columns"] = this.columns;
        }
      }
    });
  }
}
