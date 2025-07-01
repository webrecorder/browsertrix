import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

const MAX_TAGS_IN_LABEL = 5;

@customElement("btrix-workflow-tag-filter")
@localized()
export class WorkflowTagFilter extends BtrixElement {
  @property({ type: Array })
  tags?: string[];

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
      <sl-dropdown distance="12" hoist stay-open-on-select>
        <btrix-workflow-filter
          slot="trigger"
          ?checked=${!!this.tags?.length}
          caret
        >
          ${msg("Tags")}${this.tags?.length
            ? html`: ${this.renderTagsInLabel(this.tags)}`
            : nothing}
        </btrix-workflow-filter>
        <sl-menu>
          ${this.orgTagsTask.render({
            complete: (tags) =>
              tags.map(
                (tag) =>
                  html`<sl-menu-item
                    type="checkbox"
                    ?checked=${this.selected.get(tag)}
                    data-value=${tag}
                    >${tag}</sl-menu-item
                  >`,
              ),
          })}
        </sl-menu>
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
}
