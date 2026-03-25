import { localized, msg, str } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { dedupeIcon, dedupeLabelFor } from "./templates/dedupe-icon";

import { TailwindElement } from "@/classes/TailwindElement";
import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";
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
      const number_of_dependent_items = localize.number(dependentsCount);
      const number_of_dependency_items = localize.number(dependenciesCount);

      const listFormatter = new Intl.ListFormat("en", {
        style: "long",
        type: "conjunction",
      });

      tooltip = listFormatter.format([
        pluralize(dependenciesCount, {
          zero: msg("This item depends on no items"),
          one: msg("This item depends on 1 item"),
          two: msg("This item depends on 2 items"),
          few: msg(
            str`This item depends on ${number_of_dependency_items} items`,
          ),
          many: msg(
            str`This item depends on ${number_of_dependency_items} items`,
          ),
          other: msg(
            str`This item depends on ${number_of_dependency_items} items`,
          ),
        }),
        pluralize(dependentsCount, {
          zero: msg(
            "it is a dependency of 0 items in the deduplication source.",
          ),
          one: msg("it is a dependency of 1 item in the deduplication source."),
          two: msg(
            "it is a dependency of 2 items in the deduplication source.",
          ),
          few: msg(
            str`it is a dependency of ${number_of_dependent_items} items in the deduplication source.`,
          ),
          many: msg(
            str`it is a dependency of ${number_of_dependent_items} items in the deduplication source.`,
          ),
          other: msg(
            str`it is a dependency of ${number_of_dependent_items} items in the deduplication source.`,
          ),
        }),
      ]);
    } else if (dependenciesCount) {
      const number_of_dependency_items = localize.number(dependenciesCount);

      tooltip = pluralize(dependenciesCount, {
        zero: msg("This item is dependent on no items"),
        one: msg("This item is dependent on 1 item"),
        two: msg("This item is dependent on 2 items"),
        few: msg(
          str`This item is dependent on ${number_of_dependency_items} items`,
        ),
        many: msg(
          str`This item is dependent on ${number_of_dependency_items} items`,
        ),
        other: msg(
          str`This item is dependent on ${number_of_dependency_items} items`,
        ),
      });
      text = dedupeLabelFor.dependent;
    } else if (dependentsCount) {
      const number_of_dependent_items = localize.number(dependentsCount);

      tooltip = pluralize(dependentsCount, {
        zero: msg("No items depend on this item"),
        one: msg("1 item depends on this item"),
        two: msg("2 items depend on this item"),
        few: msg(str`${number_of_dependent_items} depend on this item`),
        many: msg(str`${number_of_dependent_items} depend on this item`),
        other: msg(str`${number_of_dependent_items} depend on this item`),
      });
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
