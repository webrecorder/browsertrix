import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

const GIT_PREFIX = "git+" as const;

enum BehaviorType {
  URL = "url",
  GitRepo = "gitRepo",
}

type BehaviorURL = {
  type: BehaviorType.URL;
  url: string;
};

type BehaviorGitRepo = {
  type: BehaviorType.GitRepo;
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
        type: BehaviorType.GitRepo,
        ...parseGitUrl(url),
      };
    } catch {
      return null;
    }
  }

  return {
    type: BehaviorType.URL,
    url,
  };
};

const labelFor: Record<BehaviorType, string> = {
  [BehaviorType.URL]: msg("URL"),
  [BehaviorType.GitRepo]: msg("Git Repo"),
};

@customElement("btrix-custom-behaviors-table")
@localized()
export class CustomBehaviorsTable extends TailwindElement {
  @property({ type: Array })
  customBehaviors: string[] = [];

  @property({ type: Boolean })
  editable = false;

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
          tw`relative h-full w-full grid-cols-[max-content_1fr_min-content] rounded border`,
          // TODO Consolidate with data-table
          // https://github.com/webrecorder/browsertrix/issues/2497
          tw`[--btrix-cell-padding-bottom:var(--sl-spacing-x-small)] [--btrix-cell-padding-left:var(--sl-spacing-x-small)] [--btrix-cell-padding-right:var(--sl-spacing-x-small)] [--btrix-cell-padding-top:var(--sl-spacing-x-small)]`,
        )}
      >
        <btrix-table-head class="rounded-t bg-neutral-50">
          <btrix-table-header-cell> ${msg("Source")} </btrix-table-header-cell>
          <btrix-table-header-cell class="border-l">
            ${msg("Script Location")}
          </btrix-table-header-cell>
          ${when(
            this.editable,
            () => html`
              <btrix-table-header-cell class="border-l">
                <span class="sr-only">${msg("Row actions")}</span>
              </btrix-table-header-cell>
            `,
          )}
        </btrix-table-head>
        <btrix-table-body>${this.rows.map(this.renderRow)}</btrix-table-body>
      </btrix-table>
    `;
  }

  private readonly renderRow = (row: Behavior) => {
    return html`
      <btrix-table-row class="border-t">
        <btrix-table-cell class="items-start border-r">
          ${this.renderType(row)}
        </btrix-table-cell>
        <btrix-table-cell
          class=${clsx(
            tw`block break-all`,
            row.type === BehaviorType.GitRepo && tw`p-0`,
          )}
        >
          ${row.type === BehaviorType.GitRepo
            ? this.renderGitRepoCell(row)
            : this.renderUrlCell(row)}
        </btrix-table-cell>
        ${when(
          this.editable,
          () => html`
            <btrix-table-cell>
              <sl-icon-button name="trash3"></sl-icon-button>
            </btrix-table-cell>
          `,
        )}
      </btrix-table-row>
    `;
  };

  private renderType(row: Behavior) {
    if (!this.editable) {
      return html`${labelFor[row.type]}`;
    }

    return html`
      <sl-select
        placeholder=${msg("Select Source")}
        size="small"
        value=${row.type}
      >
        ${Object.values(BehaviorType).map(
          (behaviorType) => html`
            <sl-option value=${behaviorType}>
              ${labelFor[behaviorType]}
            </sl-option>
          `,
        )}
      </sl-select>
    `;
  }

  private renderGitRepoCell(row: BehaviorGitRepo) {
    if (!this.editable) {
      const labelStyle = tw`fle inline-flex items-center justify-end border-r bg-neutral-50 p-2 text-xs leading-none text-neutral-700`;

      return html`
        <div class="break-all p-2">${row.url}</div>
        <dl class="grid grid-cols-[max-content_1fr] border-t">
          <dt class=${clsx(labelStyle, tw`border-b`)}>${msg("Path")}</dt>
          <dd class="border-b p-2">${row.path}</dd>
          <dt class=${labelStyle}>${msg("Branch")}</dt>
          <dd class="p-2">${row.branch}</dd>
        </dl>
      `;
    }

    return html`TODO`;
  }

  private renderUrlCell(row: BehaviorURL) {
    if (!this.editable) {
      return html`${row.url}`;
    }

    return html`TODO`;
  }
}
