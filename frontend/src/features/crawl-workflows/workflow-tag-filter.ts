import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlChangeEvent,
  SlCheckbox,
  SlInput,
  SlInputEvent,
} from "@shoelace-style/shoelace";
import Fuse from "fuse.js";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";

const MAX_TAGS_IN_LABEL = 5;

export type BtrixChangeWorkflowTagFilterEvent = BtrixChangeEvent<string[]>;

/**
 * @TODO Refactor into more generic component
 *
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
      <btrix-workflow-filter
        slot="trigger"
        ?checked=${!!this.tags?.length}
        multiple
        @sl-hide=${() => {
          const selectedTags = [];

          for (const [tag, value] of this.selected) {
            if (value) {
              selectedTags.push(tag);
            }
          }

          this.dispatchEvent(
            new CustomEvent<BtrixChangeEvent["detail"]>("btrix-change", {
              detail: { value: selectedTags },
            }),
          );
        }}
        @sl-after-show=${() => {
          if (this.input && !this.input.disabled) {
            this.input.focus();
          }
        }}
        @sl-after-hide=${() => (this.searchString = "")}
      >
        ${msg("Tags")}${this.tags?.length
          ? html`: ${this.renderTagsInLabel(this.tags)}`
          : nothing}

        <div
          slot="dropdown"
          class="flex max-h-[var(--auto-size-available-height)] max-w-[var(--auto-size-available-width)] flex-col overflow-hidden rounded border bg-white"
        >
          <header
            class="flex-shrink-0 flex-grow-0 overflow-hidden rounded-t border-b bg-white pb-3 pt-2"
          >
            <sl-menu-label class="part-[base]:px-4" id="tag-list-label">
              ${msg("Filter by tags")}
            </sl-menu-label>
            <div class="px-3">${this.renderSearch()}</div>
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
      </btrix-workflow-filter>
    `;
  }

  private renderTagsInLabel(tags: string[]) {
    const more = () => {
      const remainder = this.localize.number(tags.length - MAX_TAGS_IN_LABEL);

      return html`<span class="ml-2 text-xs">
        ${msg(str`+ ${remainder} more`)}
      </span>`;
    };
    return html`${tags
      .slice(0, MAX_TAGS_IN_LABEL)
      .map(
        (tag, i) =>
          html`${i > 0 ? html`<span class="opacity-50">, </span>` : ""}<strong
              class="font-semibold"
              >${tag}</strong
            >`,
      )}${tags.length > MAX_TAGS_IN_LABEL ? more() : nothing}`;
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
        placeholder=${msg("Filter tags")}
        size="small"
        ?disabled=${!this.orgTagsTask.value?.length}
        @sl-input=${(e: SlInputEvent) =>
          (this.searchString = (e.target as SlInput).value)}
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
        <li tabindex="-1" role="option" aria-checked=${checked}>
          <sl-checkbox
            class="w-full part-[base]:w-full part-[base]:rounded part-[base]:p-2  part-[base]:hover:bg-primary-50"
            value=${tag}
            ?checked=${checked}
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
        tabindex="0"
        aria-labelledby="tag-list-label"
        aria-multiselectable="true"
        @sl-change=${async (e: SlChangeEvent) => {
          e.stopPropagation();
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
