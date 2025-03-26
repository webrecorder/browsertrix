import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

const GIT_PREFIX = "git+" as const;

type BehaviorURL = {
  type: "url";
  url: string;
};

type BehaviorGitRepo = {
  type: "gitRepo";
  url: string;
  path: string;
  branch: string;
};

type Behavior = BehaviorURL | BehaviorGitRepo;

const isGitRepo = (url: string) => url.startsWith(GIT_PREFIX);

const parseGitUrl = (fullUrl: string): Omit<BehaviorGitRepo, "type"> => {
  const url = new URL(fullUrl.slice(GIT_PREFIX.length));

  return {
    url: `${url.origin}${url.pathname}`,
    path: url.searchParams.get("path") || "",
    branch: url.searchParams.get("branch") || "",
  };
};

const urlToBehavior = (url: string): Behavior | null => {
  if (isGitRepo(url)) {
    try {
      return {
        type: "gitRepo",
        ...parseGitUrl(url),
      };
    } catch {
      return null;
    }
  }

  return {
    type: "url",
    url,
  };
};

@customElement("btrix-custom-behaviors-table")
@localized()
export class CustomBehaviorsTable extends TailwindElement {
  @property({ type: Array })
  customBehaviors: string[] = [];

  @state()
  private rows: Behavior[] = [];

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("customBehaviors")) {
      this.rows = this.customBehaviors
        .map(urlToBehavior)
        .filter((item): item is Behavior => item !== null);
    }
  }

  render() {
    return html`
      <btrix-table
        class=${clsx(
          tw`relative h-full w-full grid-cols-[10em_1fr_min-content] rounded border`,
          // TODO Consolidate with data-table
          // https://github.com/webrecorder/browsertrix/issues/2497
          tw`[--btrix-cell-padding-bottom:var(--sl-spacing-x-small)] [--btrix-cell-padding-left:var(--sl-spacing-x-small)] [--btrix-cell-padding-right:var(--sl-spacing-x-small)] [--btrix-cell-padding-top:var(--sl-spacing-x-small)]`,
        )}
      >
        <btrix-table-head>
          <btrix-table-header-cell class="border-r">
            ${msg("Source")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Script Location")}
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body>${this.rows.map(this.renderRow)}</btrix-table-body>
      </btrix-table>
    `;
  }

  private readonly renderRow = (row: Behavior) => {
    return html`
      <btrix-table-row class="first:border-t">
        <btrix-table-cell class="border-r">${row.type}</btrix-table-cell>
        <btrix-table-cell>${row.url}</btrix-table-cell>
      </btrix-table-row>
    `;
  };
}
