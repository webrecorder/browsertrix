import { LitElement, html, css, CSSResultGroup } from "lit";
import { property, queryAsync } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

const DEFAULT_PANEL_ID = "default-panel";
// Match witch tailwind 4xl max width
// https://tailwindcss.com/docs/max-width
const SCREEN_LG = 896;

/**
 * Tab list
 *
 * Usage example:
 * ```ts
 * <btrix-tab-list activePanel="one">
 *   <btrix-tab slot="nav" name="one">One</btrix-tab>
 *   <btrix-tab slot="nav" name="two">Two</btrix-tab>
 * </btrix-tab-list>
 *
 * <btrix-tab-panel name="one">Tab one content</btrix-tab-panel>
 * <btrix-tab-panel name="two">Tab two content</btrix-tab-panel>
 * ```
 */

export class TabPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      min-height: 100%;
    }

    .panel[aria-hidden="false"] {
      flex: 1;
    }

    .panel[aria-hidden="true"] {
      display: none;
      height: 0;
      width: 0;
    }
  `;

  @property({ type: String })
  name?: string;

  @property({ type: Boolean })
  active = false;

  render() {
    return html`
      <div
        class="panel"
        role="tabpanel"
        id=${ifDefined(this.name)}
        aria-hidden=${!this.active}
      >
        <slot></slot>
      </div>
    `;
  }
}

export class Tab extends LitElement {
  // ID of panel the tab labels/controls
  @property({ type: String })
  name?: string;

  @property({ type: Boolean })
  active = false;

  @property({ type: Boolean })
  disabled = false;

  static styles = css`
    .tab {
      padding: 1rem 0.75rem;
      line-height: 1.2;
      font-weight: 600;
      color: var(--sl-color-neutral-500);
      transition: var(--sl-transition-fast) color;
    }

    .tab[aria-selected="true"] {
      color: var(--sl-color-blue-600);
    }

    .tab[aria-disabled="false"] {
      cursor: pointer;
    }

    .tab[aria-disabled="true"] {
      color: var(--sl-color-neutral-300);
      cursor: default;
    }
  `;

  render() {
    return html`
      <li
        class="tab"
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

type TabElement = Tab & HTMLElement;
type TabPanelElement = TabPanel & HTMLElement;

export class TabList extends LitElement {
  static styles = css`
    :host {
      --track-width: 4px;
    }

    .container {
      display: grid;
      grid-template-areas:
        "menu"
        "header"
        "main";
      grid-template-columns: 1fr;
      grid-gap: 1rem;
    }

    @media only screen and (min-width: ${SCREEN_LG}px) {
      .container {
        grid-template-areas:
          ". header"
          "menu main";
        grid-template-columns: auto ${SCREEN_LG}px;
      }
    }

    .navWrapper {
      grid-area: menu;
      overflow-y: hidden;
      overflow-x: auto;
    }

    @media only screen and (min-width: ${SCREEN_LG}px) {
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
    }

    .show-indicator .tablist {
      margin-left: var(--track-width);
    }

    @media only screen and (min-width: ${SCREEN_LG}px) {
      .tablist {
        display: block;
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
      background-color: var(--sl-color-blue-500);
    }

    @media only screen and (min-width: ${SCREEN_LG}px) {
      .tablist,
      .show-indicator .track,
      .show-indicator .indicator {
        display: block;
      }
    }
  `;

  // ID of visible panel
  @property({ type: String })
  activePanel: string = DEFAULT_PANEL_ID;

  // If panels are linear, the current panel in progress
  @property({ type: String })
  progressPanel?: string;

  @property({ type: Boolean })
  hideIndicator = false;

  @queryAsync(".track")
  private trackElem!: HTMLElement;

  @queryAsync(".indicator")
  private indicatorElem!: HTMLElement;

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("activePanel") && this.activePanel) {
      this.onActiveChange(!changedProperties.get("activePanel"));
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
    return html`
      <div class="container">
        <div class="navWrapper">${this.renderNav()}</div>
        <div class="header"><slot name="header"></slot></div>
        <div class="content">
          <slot></slot>
        </div>
      </div>
    `;
  }

  renderNav() {
    return html`
      <sl-resize-observer
        @sl-resize=${() =>
          this.repositionIndicator(this.getTab(this.progressPanel))}
      >
        <div
          class="nav ${this.progressPanel ? "linear" : "nonlinear"} ${this
            .hideIndicator
            ? "hide-indicator"
            : "show-indicator"}"
        >
          <div class="track" role="presentation">
            <div class="indicator" role="presentation"></div>
          </div>

          <ul class="tablist" role="tablist">
            <slot name="nav"></slot>
          </ul>
        </div>
      </sl-resize-observer>
    `;
  }

  private getPanels(): TabPanelElement[] {
    const slotElems = (
      this.renderRoot!.querySelector(
        ".content slot:not([name])"
      ) as HTMLSlotElement
    ).assignedElements();
    return ([...slotElems] as TabPanelElement[]).filter(
      (el) => el.tagName.toLowerCase() === "btrix-tab-panel"
    );
  }

  private getTabs(): TabElement[] {
    const slotElems = (
      this.renderRoot!.querySelector("slot[name='nav']") as HTMLSlotElement
    ).assignedElements();
    return ([...slotElems] as TabElement[]).filter(
      (el) => el.tagName.toLowerCase() === "btrix-tab"
    );
  }

  private getTab(tabName?: string): TabElement | undefined {
    if (!tabName) return;
    const tabs = this.getTabs();
    return tabs.find(({ name }) => name === tabName);
  }

  private onProgressChange(isFirstChange: boolean) {
    const progressTab = this.getTabs().find(
      (el) => el.name === this.progressPanel
    );
    if (progressTab) {
      this.repositionIndicator(progressTab, !isFirstChange);
    }
  }

  private onActiveChange(isFirstChange: boolean) {
    this.getTabs().forEach((tab) => {
      if (tab.name === this.activePanel) {
        tab.active = true;

        if (!this.progressPanel) {
          this.repositionIndicator(tab as TabElement, !isFirstChange);
        }
      } else {
        tab.active = false;
      }
    });
    this.getPanels().forEach((panel) => {
      panel.active = panel.name === this.activePanel;
      if (panel.active) {
        panel.style.display = "flex";
        panel.setAttribute("aria-hidden", "false");
      } else {
        panel.style.display = "none";
        panel.setAttribute("aria-hidden", "true");
      }
    });
  }
}
