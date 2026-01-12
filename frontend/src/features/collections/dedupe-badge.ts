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
      const number_of_dependent_crawls = `${localize.number(dependentsCount)} ${pluralOf("crawls", dependentsCount)}`;
      const number_of_dependency_crawls = `${localize.number(dependenciesCount)} ${pluralOf("crawls", dependenciesCount)}`;

      tooltip = msg(
        str`This crawl is a dependency of ${number_of_dependent_crawls} and is dependent on ${number_of_dependency_crawls} in the deduplication source.`,
      );
    } else if (dependenciesCount) {
      const number_of_dependency_crawls = `${localize.number(dependenciesCount)} ${pluralOf("crawls", dependenciesCount)}`;

      tooltip = msg(
        str`This crawl is dependent on ${number_of_dependency_crawls}.`,
      );
      text = dedupeLabelFor.dependent;
    } else if (dependentsCount) {
      const number_of_dependent_crawls = `${localize.number(dependentsCount)} ${pluralOf("crawls", dependentsCount)}`;

      tooltip = msg(
        str`This crawl is a dependency of ${number_of_dependent_crawls}.`,
      );
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
