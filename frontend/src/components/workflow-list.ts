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
import { LitElement, html, css } from "lit";
import {
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import type { SlIconButton, SlMenu } from "@shoelace-style/shoelace";

import { RelativeDuration } from "./relative-duration";
import type { Crawl, Workflow } from "../types/crawler";
import { srOnly, truncate, dropdown } from "../utils/css";
import type { NavigateEvent } from "../utils/LiteElement";

const largeBreakpointCss = css`60rem`;
const rowCss = css`
  .row {
    display: grid;
    grid-template-columns: 1fr;
  }

  @media only screen and (min-width: 30rem) {
    .row {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media only screen and (min-width: ${largeBreakpointCss}) {
    .row {
      grid-template-columns: 1fr 15rem 11rem 11rem 3rem;
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

@localized()
export class WorkflowListItem extends LitElement {
  static styles = [
    truncate,
    dropdown,
    rowCss,
    columnCss,
    hostVars,
    css`
      a {
        all: unset;
      }

      .item {
        contain: content;
        content-visibility: auto;
        contain-intrinsic-height: auto 4rem;
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
      .dropdown {
        contain: content;
        position: absolute;
        z-index: 99;
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

      .unknownValue {
        color: var(--sl-color-neutral-500);
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

      .finished {
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

      .action sl-icon-button {
        font-size: 1rem;
      }

      @media only screen and (min-width: ${largeBreakpointCss}) {
        .action {
          border-left: 1px solid var(--sl-panel-border-color);
        }
      }
    `,
  ];

  @property({ type: Object })
  workflow?: Workflow;

  @query(".dropdown")
  dropdown!: HTMLElement;

  @query(".dropdownTrigger")
  dropdownTrigger!: SlIconButton;

  @queryAssignedElements({ selector: "sl-menu", slot: "menu" })
  private menuArr!: Array<SlMenu>;

  @state()
  private dropdownIsOpen?: boolean;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat();

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("dropdownIsOpen")) {
      if (this.dropdownIsOpen) {
        this.openDropdown();
      } else {
        this.closeDropdown();
      }
    }
  }

  render() {
    return html`${this.renderRow()}${this.renderDropdown()}`;
  }

  renderRow() {
    const isActive = false;
    // const isActive =
    //   this.workflow &&
    //   ["starting", "running", "stopping"].includes(this.workflow.state);

    return html`<a
      class="item row"
      role="button"
      href=${`/orgs/${this.workflow?.oid}/crawls/crawl/${this.workflow?.id}`}
      @click=${async (e: MouseEvent) => {
        e.preventDefault();
        await this.updateComplete;
        const href = (e.currentTarget as HTMLAnchorElement).href;
        // TODO consolidate with LiteElement navTo
        const evt: NavigateEvent = new CustomEvent("navigate", {
          detail: { url: href },
          bubbles: true,
          composed: true,
        });
        this.dispatchEvent(evt);
      }}
    >
      <div class="col">
        <div class="detail url truncate">
          ${this.safeRender(this.renderName)}
        </div>
        <div class="desc">
          ${this.safeRender(
            (workflow) => html`
              <sl-format-date
                date=${`${workflow.modified}Z`}
                month="2-digit"
                day="2-digit"
                year="2-digit"
                hour="2-digit"
                minute="2-digit"
              ></sl-format-date>
            `
          )}
        </div>
      </div>
      <div class="col">
        <div class="detail">
          ${this.safeRender((workflow) =>
            workflow.lastCrawlState
              ? html`
                  <btrix-crawl-status
                    state=${workflow.lastCrawlState}
                  ></btrix-crawl-status>
                `
              : html`${msg("No Crawls Yet")}`
          )}
        </div>
        <div class="desc finished">TODO runtime</div>
      </div>
      <div class="col">
        <div class="detail">TODO total size</div>
        <div class="desc">
          ${this.safeRender(
            (workflow) =>
              html`<span class="userName">${workflow.modifiedByName}</span>`
          )}
        </div>
      </div>
      <div class="col">
        <div class="detail truncate">
          ${this.safeRender(
            (workflow) =>
              html`<span class="userName">${workflow.modifiedByName}</span>`
          )}
        </div>
        <div class="desc">
          ${this.safeRender((workflow) =>
            workflow.schedule ? msg("Scheduled") : msg("Manual Start")
          )}
        </div>
      </div>
      <div class="col action">
        <sl-icon-button
          class="dropdownTrigger"
          slot="trigger"
          name="three-dots-vertical"
          label=${msg("More")}
          @click=${(e: MouseEvent) => {
            // Prevent anchor link default behavior
            e.preventDefault();
            // Stop prop to anchor link
            e.stopPropagation();
            this.dropdownIsOpen = true;
          }}
          @focusout=${(e: FocusEvent) => {
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (this.menuArr[0]?.contains(relatedTarget)) {
              // Keep dropdown open if moving to menu selection
              return;
            }
            this.dropdownIsOpen = false;
          }}
        ></sl-icon-button>
      </div>
    </a>`;
  }

  private renderDropdown() {
    return html`<div
      class="dropdown hidden"
      aria-hidden=${!this.dropdownIsOpen}
      @animationend=${(e: AnimationEvent) => {
        const el = e.target as HTMLDivElement;
        if (e.animationName === "dropdownShow") {
          el.classList.remove("animateShow");
        }
        if (e.animationName === "dropdownHide") {
          el.classList.add("hidden");
          el.classList.remove("animateHide");
        }
      }}
    >
      <slot
        name="menu"
        @sl-select=${() => (this.dropdownIsOpen = false)}
      ></slot>
    </div> `;
  }

  private safeRender(render: (workflow: Workflow) => any) {
    if (!this.workflow) {
      return html`<sl-skeleton></sl-skeleton>`;
    }
    return render(this.workflow);
  }

  private renderName(workflow: Workflow) {
    if (workflow.name)
      return html`<span class="truncate">${workflow.name}</span>`;
    if (!workflow.firstSeed)
      return html`<span class="truncate">${workflow.id}</span>`;
    const remainder = workflow.config.seeds.length - 1;
    let nameSuffix: any = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="additionalUrls"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="additionalUrls"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <span class="primaryUrl truncate">${workflow.firstSeed}</span
      >${nameSuffix}
    `;
  }

  private repositionDropdown() {
    const { x, y } = this.dropdownTrigger.getBoundingClientRect();
    this.dropdown.style.left = `${x + window.scrollX}px`;
    this.dropdown.style.top = `${y + window.scrollY - 8}px`;
  }

  private openDropdown() {
    this.repositionDropdown();
    this.dropdown.classList.add("animateShow");
    this.dropdown.classList.remove("hidden");
  }

  private closeDropdown() {
    this.dropdown.classList.add("animateHide");
  }
}

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
         display none;
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
 
       ::slotted(btrix-workflow-list-item:not(:last-of-type)) {
         display: block;
         margin-bottom: var(--sl-spacing-x-small);
       }
     `,
  ];

  @queryAssignedElements({ selector: "btrix-workflow-list-item" })
  listItems!: Array<HTMLElement>;

  render() {
    return html` <div class="listHeader row">
        <div class="col">${msg("Name & Last Updated")}</div>
        <div class="col">${msg("Status")}</div>
        <div class="col">${msg("Size")}</div>
        <div class="col">${msg("Last Start By & Schedule")}</div>
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
