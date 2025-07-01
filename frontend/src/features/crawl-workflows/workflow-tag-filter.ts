import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlInput } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

const MAX_TAGS_IN_LABEL = 5;

/**
 * @TODO Refactor into more generic component
 */
@customElement("btrix-workflow-tag-filter")
@localized()
export class WorkflowTagFilter extends BtrixElement {
  @property({ type: Array })
  tags?: string[];

  @query("sl-input")
  private readonly input?: SlInput | null;

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
      return await this.api.fetch<string[]>(
        `/orgs/${this.orgId}/crawlconfigs/tags`,
      );
    },
    args: () => [] as const,
  });

  render() {
    return html`
      <sl-dropdown
        distance="12"
        hoist
        stay-open-on-select
        open
        @sl-after-show=${() => {
          if (this.input && !this.input.disabled) {
            this.input.focus();
          }
        }}
      >
        <btrix-workflow-filter
          slot="trigger"
          ?checked=${!!this.tags?.length}
          caret
        >
          ${msg("Tags")}${this.tags?.length
            ? html`: ${this.renderTagsInLabel(this.tags)}`
            : nothing}
        </btrix-workflow-filter>
        <div
          class="max-h-[var(--auto-size-available-height)] max-w-[var(--auto-size-available-width)] overflow-y-auto overflow-x-hidden rounded border bg-white"
        >
          <header
            class="sticky top-0 z-10 overflow-hidden rounded-t border-b bg-white pb-3 pt-2"
          >
            <sl-menu-label class="part-[base]:px-4" id="tag-list-label">
              ${msg("Filter by tags")}
            </sl-menu-label>
            <div class="px-3">${this.renderSearch()}</div>
          </header>
          ${this.orgTagsTask.render({
            complete: (tags) =>
              tags.length
                ? html` ${this.renderTagList(tags)} `
                : html`<div class="p-3 text-neutral-500">
                    ${msg("No tags found.")}
                  </div>`,
          })}
        </div>
      </sl-dropdown>
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
        class="min-w-[20ch]"
        id="tag-search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="tag-listbox"
        aria-activedescendant="tag-selected-option"
        placeholder=${msg("Filter tags")}
        size="small"
        ?disabled=${!this.orgTagsTask.value?.length}
      >
        ${this.orgTagsTask.render({
          pending: () => html`<sl-spinner slot="prefix"></sl-spinner>`,
          complete: () => html`<sl-icon slot="prefix" name="search"></sl-icon>`,
        })}
      </sl-input>
    `;
  }

  private renderTagList(tags: string[]) {
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
        class="p-1"
        role="listbox"
        tabindex="0"
        aria-labelledby="tag-list-label"
        aria-multiselectable="true"
      >
        ${tags.map(tag)}
      </ul>
    `;
  }
}
