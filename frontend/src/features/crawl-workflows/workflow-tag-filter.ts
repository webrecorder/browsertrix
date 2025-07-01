import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

@customElement("btrix-workflow-tag-filter")
@localized()
export class WorkflowTagFilter extends BtrixElement {
  @property({ type: Array })
  tags?: string[];

  private readonly tagsTask = new Task(this, {
    task: async () => {
      return await this.api.fetch<string[]>(
        `/orgs/${this.orgId}/crawlconfigs/tags`,
      );
    },
    args: () => [] as const,
  });

  render() {
    return html`
      <sl-dropdown distance="12" hoist>
        <btrix-workflow-filter
          slot="trigger"
          ?checked=${!!this.tags?.length}
          caret
        >
          ${msg("Tags")}
        </btrix-workflow-filter>
        <sl-menu>
          ${this.tagsTask.render({
            complete: (tags) =>
              tags.map(
                (tag) =>
                  html` <sl-menu-item type="checkbox">${tag}</sl-menu-item>`,
              ),
          })}
        </sl-menu>
      </sl-dropdown>
    `;
  }
}
