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

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { tw } from "@/utils/tailwind";

const MAX_TAGS_IN_LABEL = 5;

export type BtrixChangeWorkflowTagFilterEvent = BtrixChangeEvent<
  string[] | undefined
>;

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

  private readonly fuse = new Fuse<string>([]);

  private selected = new Map<string, boolean>();

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("tags")) {
      if (this.tags) {
        this.selected = new Map(this.tags.map((tag) => [tag, true]));
      } else if (changedProperties.get("tags")) {
        this.selected = new Map();
      }
    }
  }

  private readonly orgTagsTask = new Task(this, {
    task: async () => {
      const tags = await this.api.fetch<string[]>(
        `/orgs/${this.orgId}/crawlconfigs/tags`,
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

          const selectedTags = [];

          for (const [tag, value] of this.selected) {
            if (value) {
              selectedTags.push(tag);
            }
          }

          this.dispatchEvent(
            new CustomEvent<BtrixChangeEvent["detail"]>("btrix-change", {
              detail: { value: selectedTags.length ? selectedTags : undefined },
            }),
          );
        }}
      >
        ${this.tags?.length
          ? html`<span class="opacity-75">${msg("Tagged")}</span>
              ${this.renderTagsInLabel(this.tags)}`
          : msg("Tags")}

        <div
          slot="dropdown-header"
          class=${clsx(this.orgTagsTask.value && tw`border-b`, tw`pb-3`)}
        >
          <div class="flex items-center justify-between py-1">
            <sl-menu-label class="part-[base]:px-4" id="tag-list-label">
              ${msg("Filter by Tags")}
            </sl-menu-label>
            ${this.tags?.length
              ? html`<sl-button
                  variant="text"
                  size="small"
                  @click=${() => {
                    this.checkboxes.forEach((checkbox) => {
                      checkbox.checked = false;
                    });

                    this.dispatchEvent(
                      new CustomEvent<BtrixChangeEvent["detail"]>(
                        "btrix-change",
                        {
                          detail: {
                            value: undefined,
                          },
                        },
                      ),
                    );
                  }}
                  >${msg("Clear Filter")}</sl-button
                >`
              : nothing}
          </div>

          <div class="px-3">${this.renderSearch()}</div>
        </div>

        <div slot="dropdown-content" class="contents">
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
        }}
      >
        ${this.orgTagsTask.render({
          pending: () => html`<sl-spinner slot="prefix"></sl-spinner>`,
          complete: () => html`<sl-icon slot="prefix" name="search"></sl-icon>`,
        })}
      </sl-input>
    `;
  }

  private renderList(opts: { item: string }[]) {
    const tag = (tag: string) => {
      const checked = this.selected.get(tag) === true;

      return html`
        <li role="option" aria-checked=${checked}>
          <sl-checkbox
            class="w-full part-[base]:w-full part-[base]:rounded part-[base]:p-2 part-[base]:hover:bg-primary-50 part-[base]:focus:bg-primary-50"
            value=${tag}
            ?checked=${checked}
            tabindex="0"
            >${tag}
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
