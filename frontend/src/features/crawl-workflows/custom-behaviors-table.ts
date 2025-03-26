import { localized, msg } from "@lit/localize";
import type { SlChangeEvent, SlSelect } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import { nanoid } from "nanoid";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

enum BehaviorType {
  URL = "url",
  GitRepo = "gitRepo",
}

type BehaviorBase = {
  id: string;
  type: BehaviorType;
  url: string;
};

type BehaviorURL = BehaviorBase & {
  type: BehaviorType.URL;
};

type BehaviorGitRepo = BehaviorBase & {
  type: BehaviorType.GitRepo;
  path: string;
  branch: string;
};

type Behavior = BehaviorURL | BehaviorGitRepo;

const isGitRepo = (url: string) => url.startsWith(GIT_PREFIX);

const parseGitUrl = (fullUrl: string): Omit<BehaviorGitRepo, "id" | "type"> => {
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
        id: nanoid(),
        type: BehaviorType.GitRepo,
        ...parseGitUrl(url),
      };
    } catch {
      return null;
    }
  }

  return {
    id: nanoid(),
    type: BehaviorType.URL,
    url,
  };
};

const labelFor: Record<BehaviorType, string> = {
  [BehaviorType.URL]: msg("URL"),
  [BehaviorType.GitRepo]: msg("Git Repo"),
};

const inputCellStyles = tw`[--sl-input-background-color:transparent] [--sl-input-border-color-hover:transparent] [--sl-input-border-color:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)]`;

const GIT_PREFIX = "git+" as const;

@customElement("btrix-custom-behaviors-table")
@localized()
export class CustomBehaviorsTable extends TailwindElement {
  @property({ type: Array })
  customBehaviors: string[] = [];

  @property({ type: Boolean })
  editable = false;

  @state()
  private rows = new Map<string, Behavior>();

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("customBehaviors")) {
      this.rows = new Map(
        this.customBehaviors
          .map(urlToBehavior)
          .filter((item): item is Behavior => item !== null)
          .map((item) => [item.id, item]),
      );
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
        <btrix-table-body>
          ${repeat(
            this.rows,
            ([id]) => id,
            ([_, row]) => this.renderRow(row),
          )}
        </btrix-table-body>
      </btrix-table>
      ${when(
        this.editable,
        () => html`
          <sl-button class="mt-2 w-full" @click=${() => this.addRow()}>
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            <span class="text-neutral-600">${msg("Add More")}</span>
          </sl-button>
        `,
      )}
    `;
  }

  private readonly renderRow = (row: Behavior) => {
    return html`
      <btrix-table-row class="border-t">
        <btrix-table-cell
          class=${clsx(
            this.editable
              ? tw`h-[var(--sl-input-height-medium)] p-1`
              : tw`items-start`,
          )}
        >
          ${this.renderType(row)}
        </btrix-table-cell>
        <btrix-table-cell
          class=${clsx(
            tw`block break-all border-l`,
            (row.type === BehaviorType.GitRepo || this.editable) && tw`p-0`,
          )}
        >
          ${row.type === BehaviorType.GitRepo
            ? this.renderGitRepoCell(row)
            : this.renderUrlCell(row)}
        </btrix-table-cell>
        ${when(
          this.editable,
          () => html`
            <btrix-table-cell class="border-l p-1">
              <sl-icon-button
                class="text-base hover:text-danger"
                name="trash3"
                @click=${() => this.removeRow(row.id)}
              ></sl-icon-button>
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
        class="w-[8em]"
        value=${row.type}
        @sl-change=${(e: SlChangeEvent) => {
          const el = e.target as SlSelect;

          const { id, url } = row;

          this.rows = new Map(
            this.rows.set(
              row.id,
              el.value === BehaviorType.GitRepo
                ? {
                    id,
                    url,
                    type: BehaviorType.GitRepo,
                    path: "",
                    branch: "",
                  }
                : {
                    id,
                    url,
                    type: BehaviorType.URL,
                  },
            ),
          );
        }}
      >
        ${Object.values(BehaviorType).map(
          (behaviorType) => html`
            <sl-option value=${behaviorType} class="whitespace-nowrap">
              ${labelFor[behaviorType]}
            </sl-option>
          `,
        )}
      </sl-select>
    `;
  }

  private renderGitRepoCell(row: BehaviorGitRepo) {
    const subgridStyle = tw`grid grid-cols-[max-content_1fr] border-t`;
    const labelStyle = tw`fle inline-flex items-center justify-end border-r bg-neutral-50 p-2 text-xs leading-none text-neutral-700`;
    const pathLabel = msg("Path");
    const branchLabel = msg("Branch");

    if (!this.editable) {
      return html`
        <div class="break-all p-2">${row.url}</div>
        <dl class=${subgridStyle}>
          <dt class=${clsx(labelStyle, tw`border-b`)}>${pathLabel}</dt>
          <dd class="border-b p-2">${row.path}</dd>
          <dt class=${labelStyle}>${branchLabel}</dt>
          <dd class="p-2">${row.branch}</dd>
        </dl>
      `;
    }

    return html`<btrix-url-input
        placeholder=${msg("Enter URL to Git repository")}
        class=${clsx(inputCellStyles)}
        value=${row.url}
      ></btrix-url-input>
      <div class=${subgridStyle}>
        <label class=${clsx(labelStyle, tw`border-b`)}>${pathLabel}</label>
        <div class="border-b">
          <sl-input
            class=${clsx(inputCellStyles)}
            size="small"
            value=${row.path}
            placeholder=${msg("Optional path")}
            spellcheck="false"
          ></sl-input>
        </div>
        <label class=${labelStyle}>${branchLabel}</label>
        <div>
          <sl-input
            class=${clsx(inputCellStyles)}
            size="small"
            value=${row.branch}
            placeholder=${msg("Optional branch")}
            spellcheck="false"
          ></sl-input>
        </div>
      </div> `;
  }

  private renderUrlCell(row: BehaviorURL) {
    if (!this.editable) {
      return html`${row.url}`;
    }

    return html`<btrix-url-input
      placeholder=${msg("Enter URL to JavaScript file")}
      class=${clsx(inputCellStyles)}
      value=${row.url}
    ></btrix-url-input>`;
  }

  private addRow() {
    const id = nanoid();

    this.rows = new Map(
      this.rows.set(id, {
        id,
        type: BehaviorType.URL,
        url: "",
      }),
    );
  }

  private removeRow(id: string) {
    this.rows.delete(id);
    this.rows = new Map(this.rows);
  }
}
