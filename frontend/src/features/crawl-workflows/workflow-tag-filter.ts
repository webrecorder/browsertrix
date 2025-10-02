import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlChangeEvent,
  SlCheckbox,
  SlInput,
  SlInputEvent,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import Fuse from "fuse.js";
import { html, nothing, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { isFocusable } from "tabbable";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { type WorkflowTag, type WorkflowTags } from "@/types/workflow";
import { stopProp } from "@/utils/events";
import { tw } from "@/utils/tailwind";

const MAX_TAGS_IN_LABEL = 5;

type ChangeWorkflowTagEventDetails =
  | { tags: string[]; type: "and" | "or" }
  | undefined;

export type BtrixChangeWorkflowTagFilterEvent =
  BtrixChangeEvent<ChangeWorkflowTagEventDetails>;

/**
 * @fires btrix-change
 */
@customElement("btrix-workflow-tag-filter")
@localized()
export class WorkflowTagFilter extends BtrixElement {
  @property({ type: Array })
  tags?: string[];

  @state()
  private searchString = "";

  @query("sl-input")
  private readonly input?: SlInput | null;

  @queryAll("sl-checkbox")
  private readonly checkboxes!: NodeListOf<SlCheckbox>;

  private readonly fuse = new Fuse<WorkflowTag>([], {
    keys: ["tag"],
  });

  @state()
  get selectedTags() {
    return Array.from(this.selected.entries())
      .filter(([_tag, selected]) => selected)
      .map(([tag]) => tag);
  }

  private selected = new Map<string, boolean>();

  @state()
  type: "and" | "or" = "or";

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("tags")) {
      if (this.tags) {
        this.selected = new Map(this.tags.map((tag) => [tag, true]));
      } else if (changedProperties.get("tags")) {
        this.selected = new Map();
      }
    }
    if (
      changedProperties.has("selectedTags") ||
      changedProperties.has("type")
    ) {
      this.dispatchEvent(
        new CustomEvent<
          BtrixChangeEvent<ChangeWorkflowTagEventDetails>["detail"]
        >("btrix-change", {
          detail: {
            value: this.selectedTags.length
              ? { tags: this.selectedTags, type: this.type }
              : undefined,
          },
        }),
      );
    }
  }

  private readonly orgTagsTask = new Task(this, {
    task: async () => {
      const { tags } = await this.api.fetch<WorkflowTags>(
        `/orgs/${this.orgId}/crawlconfigs/tagCounts`,
      );

      this.fuse.setCollection(tags);

      // Match fuse shape
      return tags.map((item) => ({ item }));
    },
    args: () => [] as const,
  });

  render() {
    return html`
      <btrix-filter-chip
        ?checked=${!!this.tags?.length}
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
        ${this.tags?.length
          ? html`<span class="opacity-75">${msg("Tagged")}</span>
              ${this.renderTagsInLabel(this.tags)}`
          : msg("Tags")}

        <div
          slot="dropdown-content"
          class="flex max-h-[var(--auto-size-available-height)] max-w-[var(--auto-size-available-width)] flex-col overflow-hidden rounded border bg-white text-left"
        >
          <header
            class=${clsx(
              this.orgTagsTask.value && tw`border-b`,
              tw`flex-shrink-0 flex-grow-0 overflow-hidden rounded-t bg-white pb-3`,
            )}
          >
            <sl-menu-label
              class="min-h-[var(--sl-input-height-small)] part-[base]:flex part-[base]:items-center part-[base]:justify-between part-[base]:gap-4 part-[base]:px-3"
            >
              <div
                id="tag-list-label"
                class="leading-[var(--sl-input-height-small)]"
              >
                ${msg("Filter by Tags")}
              </div>
              ${this.tags?.length
                ? html`<sl-button
                    variant="text"
                    size="small"
                    class="part-[label]:px-0"
                    @click=${() => {
                      this.checkboxes.forEach((checkbox) => {
                        checkbox.checked = false;
                      });

                      this.type = "or";

                      this.dispatchEvent(
                        new CustomEvent<
                          BtrixChangeEvent<ChangeWorkflowTagEventDetails>["detail"]
                        >("btrix-change", {
                          detail: {
                            value: undefined,
                          },
                        }),
                      );
                    }}
                    >${msg("Clear")}</sl-button
                  >`
                : nothing}
            </sl-menu-label>

            <div class="flex gap-2 px-3">
              ${this.renderSearch()}
              <sl-radio-group
                size="small"
                value=${this.type}
                @sl-change=${(event: SlChangeEvent) => {
                  this.type = (event.target as HTMLInputElement).value as
                    | "or"
                    | "and";
                }}
                @sl-after-hide=${stopProp}
              >
                <sl-tooltip hoist content=${msg("Any of the selected tags")}>
                  <sl-radio-button value="or" checked>
                    <sl-icon name="union" slot="prefix"></sl-icon>
                    ${msg("Any")}
                  </sl-radio-button>
                </sl-tooltip>
                <sl-tooltip hoist content=${msg("All of the selected tags")}>
                  <sl-radio-button value="and">
                    <sl-icon name="intersect" slot="prefix"></sl-icon>
                    ${msg("All")}
                  </sl-radio-button>
                </sl-tooltip>
              </sl-radio-group>
            </div>
          </header>

          ${this.orgTagsTask.render({
            complete: (tags) => {
              let options = tags;

              if (tags.length && this.searchString) {
                options = this.fuse.search(this.searchString);
              }

              if (options.length) {
                return this.renderList(options);
              }

              return html`<div class="p-3 text-neutral-500">
                ${this.searchString
                  ? msg("No matching tags found.")
                  : msg("No tags found.")}
              </div>`;
            },
          })}
        </div>
      </btrix-filter-chip>
    `;
  }

  private renderTagsInLabel(tags: string[]) {
    const formatter2 = this.localize.list(
      tags.length > MAX_TAGS_IN_LABEL
        ? [
            ...tags.slice(0, MAX_TAGS_IN_LABEL),
            msg(
              str`${this.localize.number(tags.length - MAX_TAGS_IN_LABEL)} more`,
            ),
          ]
        : tags,
      { type: this.type === "and" ? "conjunction" : "disjunction" },
    );

    return formatter2.map((part, index, array) =>
      part.type === "literal"
        ? html`<span class="opacity-75">${part.value}</span>`
        : tags.length > MAX_TAGS_IN_LABEL && index === array.length - 1
          ? html`<span class="text-primary-500"> ${part.value} </span>`
          : html`<span>${part.value}</span>`,
    );
  }

  private renderSearch() {
    return html`
      <label for="tag-search" class="sr-only">${msg("Filter tags")}</label>
      <sl-input
        class="min-w-[30ch]"
        id="tag-search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="tag-listbox"
        aria-activedescendant="tag-selected-option"
        value=${this.searchString}
        placeholder=${msg("Search for tag")}
        size="small"
        ?disabled=${!this.orgTagsTask.value?.length}
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
        ${this.orgTagsTask.render({
          pending: () => html`<sl-spinner slot="prefix"></sl-spinner>`,
          complete: () => html`<sl-icon slot="prefix" name="search"></sl-icon>`,
        })}
      </sl-input>
    `;
  }

  private renderList(opts: { item: WorkflowTag }[]) {
    const tag = (tag: WorkflowTag) => {
      const checked = this.selected.get(tag.tag) === true;

      return html`
        <li role="option" aria-checked=${checked}>
          <sl-checkbox
            class="w-full part-[label]:flex part-[base]:w-full part-[label]:w-full part-[label]:items-center part-[label]:justify-between part-[base]:rounded part-[base]:p-2 part-[base]:hover:bg-primary-50"
            value=${tag.tag}
            ?checked=${checked}
            >${tag.tag}
            <btrix-badge pill variant="cyan">${tag.count}</btrix-badge>
          </sl-checkbox>
        </li>
      `;
    };

    return html`
      <ul
        id="tag-listbox"
        class="flex-1 overflow-auto p-1"
        role="listbox"
        aria-labelledby="tag-list-label"
        aria-multiselectable="true"
        @sl-change=${async (e: SlChangeEvent) => {
          const { checked, value } = e.target as SlCheckbox;

          this.selected.set(value, checked);
          this.requestUpdate("selectedTags");
        }}
      >
        ${repeat(
          opts,
          ({ item }) => item,
          ({ item }) => tag(item),
        )}
      </ul>
    `;
  }
}
