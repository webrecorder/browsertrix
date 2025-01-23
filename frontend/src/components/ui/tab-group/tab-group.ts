import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
} from "lit/decorators.js";

import type { TabClickDetail, TabGroupTab } from "./tab";
import { type TabGroupPanel } from "./tab-panel";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * @fires btrix-tab-change
 * @example Usage:
 * ```ts
 * <btrix-tab-group>
 *   <btrix-tab-group-tab slot="nav" panel="first">First</btrix-tab-group-tab>
 *   <btrix-tab-group-tab slot="nav" panel="second">Second</btrix-tab-group-tab>
 *   <btrix-tab-group-panel name="first">First tab content</btrix-tab-group-panel>
 *   <btrix-tab-group-panel name="second">First tab content</btrix-tab-group-panel>
 * </btrix-tab-group>
 * ```
 */
@customElement("btrix-tab-group")
export class TabGroup extends TailwindElement {
  /* Active panel name */
  @property({ type: String, reflect: false })
  active = "";

  @property({ type: String })
  overrideTabLayout?: string;

  /* Nav placement */
  @property({ type: String })
  placement: "top" | "start" = "top";

  @property({ type: String, noAccessor: true, reflect: true })
  role = "tablist";

  @queryAssignedElements({ selector: "btrix-tab-group-tab", slot: "nav" })
  tabs!: TabGroupTab[];

  @queryAssignedElements({
    selector: "btrix-tab-group-tab:focus",
    slot: "nav",
  })
  focusedTab!: TabGroupTab[];

  @queryAssignedElements({ selector: "btrix-tab-group-panel" })
  panels!: TabGroupPanel[];

  protected firstUpdated() {
    if (!this.active) {
      this.tabs[0]?.click();
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("active") && this.active) {
      this.handleActiveChange();
    }
  }

  render() {
    return html`
      <div
        class=${clsx(
          tw`flex flex-col`,
          this.placement === "start" && tw`gap-8 lg:flex-row`,
        )}
      >
        <div
          class=${clsx(
            this.overrideTabLayout || [
              tw`flex flex-1 flex-col gap-2`,
              this.placement === "start"
                ? tw`lg:sticky lg:top-2 lg:max-w-[16.5rem] lg:self-start`
                : tw`lg:flex-row`,
            ],
          )}
          @keydown=${this.onKeyDown}
        >
          <slot name="nav" @btrix-select-tab=${this.onSelectTab}></slot>
        </div>
        <div class="flex-1">
          <slot></slot>
        </div>
      </div>
    `;
  }

  private handleActiveChange() {
    this.tabs.forEach((tab) => {
      tab.active = tab.panel === this.active;
      if (tab.active) {
        this.focusTab(tab);
      } else {
        this.unfocusTab(tab);
      }
    });
    this.panels.forEach((panel) => {
      panel.active = panel.name === this.active;
    });
  }

  private onKeyDown(e: KeyboardEvent) {
    e.stopPropagation();

    switch (e.key) {
      case "ArrowLeft":
        this.focusPrevTab();
        break;
      case "ArrowRight":
        this.focusNextTab();
        break;
      default:
        break;
    }
  }

  private focusNextTab() {
    const currTabIdx = this.tabs.indexOf(this.focusedTab[0]);
    const nextTabIdx = currTabIdx === this.tabs.length - 1 ? 0 : currTabIdx + 1;

    this.tabs.forEach((tab, idx) => {
      if (idx === nextTabIdx) {
        this.focusTab(tab);
      } else {
        this.unfocusTab(tab);
      }
    });
  }

  private focusPrevTab() {
    const currTabIdx = this.tabs.indexOf(this.focusedTab[0]);
    const prevTabIdx = currTabIdx === 0 ? this.tabs.length - 1 : currTabIdx - 1;

    this.tabs.forEach((tab, idx) => {
      if (idx === prevTabIdx) {
        this.focusTab(tab);
      } else {
        this.unfocusTab(tab);
      }
    });
  }

  unfocusTab(tab: TabGroupTab | null) {
    if (!tab) return;
    tab.button?.setAttribute("tabindex", "-1");
  }

  focusTab(tab: TabGroupTab | null) {
    if (!tab || tab.disabled) return;
    tab.button?.setAttribute("tabindex", "0");
    tab.button?.focus();
  }

  private onSelectTab(e: CustomEvent<TabClickDetail>) {
    e.stopPropagation();
    this.active = e.detail.panel;
    this.dispatchEvent(
      new CustomEvent<string>("btrix-tab-change", {
        detail: this.active,
        bubbles: true,
      }),
    );
  }
}
