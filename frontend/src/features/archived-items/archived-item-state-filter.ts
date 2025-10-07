import { localized, msg, str } from "@lit/localize";
import type {
  SlChangeEvent,
  SlCheckbox,
  SlInput,
  SlInputEvent,
} from "@shoelace-style/shoelace";
import Fuse from "fuse.js";
import { html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { isEqual } from "lodash";
import { isFocusable } from "tabbable";

import { CrawlStatus } from "./crawl-status";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { type CrawlState } from "@/types/crawlState";
import { finishedCrawlStates } from "@/utils/crawler";
import { tw } from "@/utils/tailwind";

const MAX_STATES_IN_LABEL = 2;

type ChangeArchivedItemStateEventDetails = CrawlState[];

export type BtrixChangeArchivedItemStateFilterEvent =
  BtrixChangeEvent<ChangeArchivedItemStateEventDetails>;

/**
 * @fires btrix-change
 */
@customElement("btrix-archived-item-state-filter")
@localized()
export class ArchivedItemStateFilter extends BtrixElement {
  @property({ type: Array })
  states?: CrawlState[];

  @state()
  private searchString = "";

  @query("sl-input")
  private readonly input?: SlInput | null;

  @queryAll("sl-checkbox")
  private readonly checkboxes!: NodeListOf<SlCheckbox>;

  private readonly fuse = new Fuse<CrawlState>(finishedCrawlStates);

  @state({ hasChanged: isEqual })
  selected = new Map<CrawlState, boolean>();

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("states")) {
      if (this.states) {
        this.selected = new Map(this.states.map((state) => [state, true]));
      } else if (changedProperties.get("states")) {
        this.selected = new Map();
      }
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("selected")) {
      this.dispatchEvent(
        new CustomEvent<
          BtrixChangeEvent<ChangeArchivedItemStateEventDetails>["detail"]
        >("btrix-change", {
          detail: {
            value: Array.from(this.selected.entries())
              .filter(([_tag, selected]) => selected)
              .map(([tag]) => tag),
          },
        }),
      );
    }
  }

  render() {
    const options = this.searchString
      ? this.fuse.search(this.searchString)
      : finishedCrawlStates.map((state) => ({ item: state }));
    return html`
      <btrix-filter-chip
        ?checked=${!!this.states?.length}
        selectFromDropdown
        stayOpenOnChange
        @sl-after-show=${() => {
          if (this.input && !this.input.disabled) {
            this.input.focus();
          }
        }}
        @sl-after-hide=${() => {
          this.searchString = "";
        }}
      >
        ${this.states?.length
          ? html`<span class="opacity-75">${msg("Status")}</span>
              ${this.renderStatesInLabel(this.states)}`
          : msg("Status")}

        <div
          slot="dropdown-content"
          class="flex max-h-[var(--auto-size-available-height)] max-w-[var(--auto-size-available-width)] flex-col overflow-hidden rounded border bg-white text-left"
        >
          <header
            class="flex-shrink-0 flex-grow-0 overflow-hidden rounded-t border-b bg-white pb-3"
          >
            <sl-menu-label
              class="min-h-[var(--sl-input-height-small)] part-[base]:flex part-[base]:items-center part-[base]:justify-between part-[base]:gap-4 part-[base]:px-3"
            >
              <div
                id="tag-list-label"
                class="leading-[var(--sl-input-height-small)]"
              >
                ${msg("Filter by Status")}
              </div>
              ${this.states?.length
                ? html`<sl-button
                    variant="text"
                    size="small"
                    class="part-[label]:px-0"
                    @click=${() => {
                      this.checkboxes.forEach((checkbox) => {
                        checkbox.checked = false;
                      });

                      this.dispatchEvent(
                        new CustomEvent<
                          BtrixChangeEvent<ChangeArchivedItemStateEventDetails>["detail"]
                        >("btrix-change", {
                          detail: {
                            value: [],
                          },
                        }),
                      );
                    }}
                    >${msg("Clear")}</sl-button
                  >`
                : html`<span class="opacity-50">${msg("Any")}</span>`}
            </sl-menu-label>

            <div class="flex gap-2 px-3">${this.renderSearch()}</div>
          </header>

          ${options.length > 0
            ? this.renderList(options)
            : html`<div class="p-3 text-neutral-500">
                ${msg("No matching states found.")}
              </div>`}
        </div>
      </btrix-filter-chip>
    `;
  }

  private renderStatesInLabel(states: string[]) {
    const formatter = this.localize.list(
      states.length > MAX_STATES_IN_LABEL
        ? [
            ...states.slice(0, MAX_STATES_IN_LABEL),
            msg(
              str`${this.localize.number(states.length - MAX_STATES_IN_LABEL)} more`,
            ),
          ]
        : states,
      { type: "disjunction" },
    );

    return formatter.map((part, index, array) =>
      part.type === "literal"
        ? html`<span class="opacity-75">${part.value}</span>`
        : states.length > MAX_STATES_IN_LABEL && index === array.length - 1
          ? html`<span class="text-primary-500"> ${part.value} </span>`
          : html`<span>${this.renderLabel(part.value as CrawlState)}</span>`,
    );
  }

  private renderLabel(state: CrawlState) {
    const { icon, label } = CrawlStatus.getContent({ state });
    return html`<span
      class=${tw`inline-flex items-baseline gap-1 [&_sl-icon]:relative [&_sl-icon]:bottom-[-0.05rem]`}
      >${icon}${label}</span
    >`;
  }

  private renderSearch() {
    return html`
      <label for="state-search" class="sr-only"
        >${msg("Filter statuses")}</label
      >
      <sl-input
        class="min-w-[30ch]"
        id="state-search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="state-listbox"
        aria-activedescendant="state-selected-option"
        value=${this.searchString}
        placeholder=${msg("Search for status")}
        size="small"
        @sl-input=${(e: SlInputEvent) =>
          (this.searchString = (e.target as SlInput).value)}
        @keydown=${(e: KeyboardEvent) => {
          // Prevent moving to next tabbable element since dropdown should close
          if (e.key === "Tab") e.preventDefault();
          if (e.key === "ArrowDown" && isFocusable(this.checkboxes[0])) {
            this.checkboxes[0].focus();
          }
        }}
      >
        <sl-icon slot="prefix" name="search"></sl-icon>
      </sl-input>
    `;
  }

  private renderList(opts: { item: CrawlState }[]) {
    const state = (state: CrawlState) => {
      const checked = this.selected.get(state) === true;

      const { icon, label } = CrawlStatus.getContent({ state });

      return html`
        <li role="option" aria-checked=${checked}>
          <sl-checkbox
            class="w-full part-[label]:flex part-[base]:w-full part-[label]:w-full part-[label]:items-center part-[label]:justify-between part-[base]:rounded part-[base]:p-2 part-[base]:hover:bg-primary-50"
            value=${state}
            ?checked=${checked}
          >
            <span class="contents"
              >${label}<span class="ml-2 flex place-content-center"
                >${icon}</span
              ></span
            >
          </sl-checkbox>
        </li>
      `;
    };

    return html`
      <ul
        id="state-listbox"
        class="flex-1 overflow-auto p-1"
        role="listbox"
        aria-labelledby="tag-list-label"
        aria-multiselectable="true"
        @sl-change=${async (e: SlChangeEvent) => {
          const { checked, value } = e.target as SlCheckbox;

          this.selected = new Map(
            this.selected.set(value as CrawlState, checked),
          );
        }}
      >
        ${repeat(
          opts,
          ({ item }) => item,
          ({ item }) => state(item),
        )}
      </ul>
    `;
  }
}
