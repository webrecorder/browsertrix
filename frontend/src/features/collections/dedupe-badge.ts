import { localized, msg, str } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";

export const dedupeIconFor = {
  dependent: "file-earmark-scan3",
  dependency: "file-earmark-scan2",
  both: "file-earmark-scan3",
} as const;

export const dedupeLabelFor = {
  dependent: msg("Dependent"),
  dependency: msg("Dependency"),
  both: msg("Dependent"),
} as const;

@customElement("btrix-dedupe-badge")
@localized()
export class DedupeBadge extends TailwindElement {
  @property({ type: Array })
  dependents?: string[] = [];

  @property({ type: Array })
  dependencies?: string[] = [];

  render() {
    const dependentsCount = this.dependents?.length;
    const dependenciesCount = this.dependencies?.length;

    if (!dependentsCount && !dependenciesCount) return;

    let tooltip = "";
    let icon: string = dedupeIconFor.both;
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
      icon = dedupeIconFor.dependent;
      text = dedupeLabelFor.dependent;
    } else if (dependentsCount) {
      const number_of_dependent_crawls = `${localize.number(dependentsCount)} ${pluralOf("crawls", dependentsCount)}`;

      tooltip = msg(
        str`This crawl is a dependency of ${number_of_dependent_crawls}.`,
      );
      icon = dedupeIconFor.dependency;
      text = dedupeLabelFor.dependency;
    }

    return html`<btrix-popover content=${tooltip} hoist>
      <btrix-badge variant="orange" outline>
        <sl-icon class="mr-1.5" name=${icon} library="app"></sl-icon>
        ${text}
      </btrix-badge>
    </btrix-popover>`;
  }
}
