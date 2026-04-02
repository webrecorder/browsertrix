import { localized } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { dedupeIcon, dedupeLabelFor } from "./templates/dedupe-icon";
import { dedupeStatusText } from "./templates/dedupe-status-text";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

@customElement("btrix-dedupe-badge")
@localized()
export class DedupeBadge extends TailwindElement {
  static styles = css`
    :host {
      display: contents;
    }
  `;

  @property({ type: Array })
  dependents?: string[] = [];

  @property({ type: Array })
  dependencies?: string[] = [];

  render() {
    const dependentsCount = this.dependents?.length ?? 0;
    const dependenciesCount = this.dependencies?.length ?? 0;

    if (!dependentsCount && !dependenciesCount) return;

    const tooltip = dedupeStatusText(dependentsCount, dependenciesCount);
    let text: string = dedupeLabelFor.both;

    if (!dependentsCount) {
      text = dedupeLabelFor.dependent;
    } else if (!dependenciesCount) {
      text = dedupeLabelFor.dependency;
    }

    return html`<btrix-popover content=${tooltip} hoist>
      <btrix-badge variant="orange">
        ${dedupeIcon(
          {
            hasDependents: Boolean(dependentsCount),
            hasDependencies: Boolean(dependenciesCount),
          },
          {
            className: tw`mr-1.5`,
          },
        )}
        ${text}
      </btrix-badge>
    </btrix-popover>`;
  }
}
