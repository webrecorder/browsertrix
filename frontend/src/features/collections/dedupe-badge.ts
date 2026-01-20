import { localized, msg, str } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { dedupeIcon, dedupeLabelFor } from "./templates/dedupe-icon";

import { TailwindElement } from "@/classes/TailwindElement";
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";
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
    const dependentsCount = this.dependents?.length;
    const dependenciesCount = this.dependencies?.length;

    if (!dependentsCount && !dependenciesCount) return;

    let tooltip = "";
    let text: string = dedupeLabelFor.both;

    if (dependentsCount && dependenciesCount) {
      const number_of_dependent_items = `${localize.number(dependentsCount)} ${pluralOf("items", dependentsCount)}`;
      const number_of_dependency_items = `${localize.number(dependenciesCount)} ${pluralOf("items", dependenciesCount)}`;

      tooltip = msg(
        str`This item is a dependency of ${number_of_dependent_items} and is dependent on ${number_of_dependency_items} in the deduplication source.`,
      );
    } else if (dependenciesCount) {
      const number_of_dependency_items = `${localize.number(dependenciesCount)} ${pluralOf("items", dependenciesCount)}`;

      tooltip = msg(
        str`This item is dependent on ${number_of_dependency_items}.`,
      );
      text = dedupeLabelFor.dependent;
    } else if (dependentsCount) {
      const number_of_dependent_items = `${localize.number(dependentsCount)} ${pluralOf("items", dependentsCount)}`;

      tooltip = msg(str`${number_of_dependent_items} depends on this item.`);
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
