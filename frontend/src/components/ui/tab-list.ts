import { css, html, type PropertyValues } from "lit";
import { customElement, property, queryAsync } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";

const DEFAULT_PANEL_ID = "default-panel";
// postcss-lit-disable-next-line
export const TWO_COL_SCREEN_MIN_CSS = css`64.5rem`;

const tabTagName = "btrix-tab-list-tab" as const;

@customElement(tabTagName)
export class TabListTab extends TailwindElement {
  // ID of panel the tab labels/controls
  @property({ type: String })
  name?: string;

  @property({ type: Boolean })
  active = false;

  @property({ type: Boolean })
  disabled = false;

  render() {
    return html`
      <li
        class="cursor-pointer p-3 font-semibold leading-tight text-neutral-500 transition-colors duration-fast aria-disabled:cursor-default aria-selected:text-primary-600"
        role="tab"
        aria-selected=${this.active}
        aria-controls=${ifDefined(this.name)}
        aria-disabled=${ifDefined(this.disabled)}
        tabindex=${this.disabled ? "-1" : "0"}
      >
        <slot></slot>
      </li>
    `;
  }
}

type TabElement = TabListTab & HTMLElement;

/**
 * Tab list with indicator
 *
 * Usage example:
 * ```ts
 * <btrix-tab-list tab="one">
 *   <btrix-tab name="one">One</btrix-tab>
 *   <btrix-tab name="two">Two</btrix-tab>
 * </btrix-tab-list>
 * ```
 */
@customElement("btrix-tab-list")
export class TabList extends TailwindElement {
  static styles = css`
    :host {
      --track-width: 4px;
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      .navWrapper {
        overflow: initial;
      }
    }

    .header {
      grid-area: header;
      font-size: var(--sl-font-size-large);
      font-weight: 500;
      line-height: 1;
    }

    .content {
      grid-area: main;
    }

    .nav {
      position: relative;
      position: -webkit-sticky;
      position: sticky;
      top: var(--sl-spacing-medium);
    }

    .tablist {
      display: flex;
      margin: 0;
      list-style: none;
      padding: 0;
      gap: 0.5rem;
    }

    .show-indicator .tablist {
      margin-left: var(--track-width);
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      .tablist {
        flex-direction: column;
      }
    }

    .track {
      display: none;
      position: absolute;
      top: 0;
      height: 100%;
      width: var(--track-width);
      border-radius: var(--track-width);
      background-color: var(--sl-color-neutral-100);
      box-shadow: inset 0 0 2px var(--sl-color-neutral-300);
    }

    .indicator {
      display: none;
      position: absolute;
      width: var(--track-width);
      border-radius: var(--track-width);
      background-color: var(--sl-color-primary-500);
    }

    @media only screen and (min-width: ${TWO_COL_SCREEN_MIN_CSS}) {
      .show-indicator .track,
      .show-indicator .indicator {
        display: block;
      }
    }
  `;

  // ID of active tab
  @property({ type: String })
  tab: string = DEFAULT_PANEL_ID;

  // If panels are linear, the current panel in progress
  @property({ type: String })
  progressPanel?: string;

  @property({ type: Boolean })
  hideIndicator = false;

  @queryAsync(".track")
  private readonly trackElem!: HTMLElement;

  @queryAsync(".indicator")
  private readonly indicatorElem!: HTMLElement;

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("tab") && this.tab) {
      this.onActiveChange(!changedProperties.get("tab"));
    }
    if (changedProperties.has("progressPanel") && this.progressPanel) {
      this.onProgressChange(!changedProperties.get("progressPanel"));
    }
  }

  private async repositionIndicator(activeTab?: TabElement, animate = true) {
    if (!activeTab || this.hideIndicator) return;

    const trackElem = await this.trackElem;
    const indicatorElem = await this.indicatorElem;
    const { top: tabTop, height: tabHeight } =
      activeTab.getBoundingClientRect();
    const top = tabTop - trackElem.getBoundingClientRect().top;

    if (animate) {
      indicatorElem.style.transition =
        "var(--sl-transition-fast) transform ease, var(--sl-transition-fast) height ease";
    } else {
      indicatorElem.style.transition = "";
    }

    if (this.progressPanel) {
      indicatorElem.style.height = `${top + tabHeight}px`;
    } else {
      indicatorElem.style.height = `${tabHeight}px`;
      indicatorElem.style.transform = `translateY(${top}px)`;
    }
  }

  render() {
    return html`<div class="navWrapper min-w-0">${this.renderNav()}</div>`;
  }

  renderNav() {
    return html`
      <sl-resize-observer
        @sl-resize=${async () =>
          this.repositionIndicator(this.getTab(this.progressPanel))}
      >
        <div
          class="nav ${this.progressPanel ? "linear" : "nonlinear"} ${this
            .hideIndicator
            ? "hide-indicator"
            : "show-indicator"} -mx-3 overflow-x-hidden px-3"
        >
          <div class="track" role="presentation">
            <div class="indicator" role="presentation"></div>
          </div>

          <ul class="tablist -mx-3 overflow-x-auto px-3" role="tablist">
            <slot></slot>
          </ul>
        </div>
      </sl-resize-observer>
    `;
  }

  private getTabs(): TabElement[] {
    const slotElems = this.renderRoot
      .querySelector<HTMLSlotElement>("slot")!
      .assignedElements();
    return ([...slotElems] as TabElement[]).filter(
      (el) => el.tagName.toLowerCase() === tabTagName,
    );
  }

  private getTab(tabName?: string): TabElement | undefined {
    if (!tabName) return;
    const tabs = this.getTabs();
    return tabs.find(({ name }) => name === tabName);
  }

  private onProgressChange(isFirstChange: boolean) {
    const progressTab = this.getTabs().find(
      (el) => el.name === this.progressPanel,
    );
    if (progressTab) {
      void this.repositionIndicator(progressTab, !isFirstChange);
    }
  }

  private onActiveChange(isFirstChange: boolean) {
    this.getTabs().forEach((tab) => {
      if (tab.name === this.tab) {
        tab.active = true;

        if (!this.progressPanel) {
          void this.repositionIndicator(tab, !isFirstChange);
        }
      } else {
        tab.active = false;
      }
    });
  }
}
