import { localized, msg } from "@lit/localize";
import type {
  SlChangeEvent,
  SlInput,
  SlInputEvent,
  SlSelect,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import { nanoid } from "nanoid";
import { z } from "zod";

import { BtrixElement } from "@/classes/BtrixElement";
import type { TableRow } from "@/components/ui/table/table-row";
import type { UrlInput } from "@/components/ui/url-input";
import { notSpecified } from "@/layouts/empty";
import { APIErrorDetail } from "@/types/api";
import type { SeedConfig } from "@/types/crawler";
import { APIError } from "@/utils/api";
import { tw } from "@/utils/tailwind";

type CustomBehaviorValue = SeedConfig["customBehaviors"];
type ChangeEventDetail = {
  value: CustomBehaviorValue;
};

enum BehaviorType {
  FileURL = "fileUrl",
  GitRepo = "gitRepo",
}

const rowIdSchema = z.string().nanoid();
type RowId = z.infer<typeof rowIdSchema>;

const UnknownErrorCode = "UNKNOWN_ERROR" as const;
type ValidityErrorCodes =
  | APIErrorDetail.WorkflowCustomBehaviorBranchNotFound
  | APIErrorDetail.WorkflowCustomBehaviorNotFound
  | typeof UnknownErrorCode;
type RowValidity = { valid: true } | { error: ValidityErrorCodes };

type BehaviorBase = {
  id: RowId;
  type: BehaviorType;
  url: string;
  path?: string;
  branch?: string;
};

type BehaviorFileURL = BehaviorBase & {
  type: BehaviorType.FileURL;
};

type BehaviorGitRepo = Required<BehaviorBase> & {
  type: BehaviorType.GitRepo;
};

type Behavior = BehaviorFileURL | BehaviorGitRepo;

const GIT_PREFIX = "git+" as const;
const EMPTY_ROW: Omit<BehaviorGitRepo, "id"> = {
  type: BehaviorType.GitRepo,
  url: "",
  path: "",
  branch: "",
} as const;
const INPUT_CLASSNAME = "input" as const;

const isGitRepo = (url: string) => url.startsWith(GIT_PREFIX);

const parseGitRepo = (
  repoUrl: string,
): Omit<BehaviorGitRepo, "id" | "type"> => {
  const url = new URL(repoUrl.slice(GIT_PREFIX.length));

  return {
    url: `${url.origin}${url.pathname}`,
    path: url.searchParams.get("path") || "",
    branch: url.searchParams.get("branch") || "",
  };
};

const stringifyGitRepo = (behavior: BehaviorGitRepo): string => {
  return `${GIT_PREFIX}${behavior.url}?branch=${behavior.branch}&path=${behavior.path}`;
};

const urlToBehavior = (url: string): Behavior | null => {
  if (isGitRepo(url)) {
    try {
      return {
        id: nanoid(),
        type: BehaviorType.GitRepo,
        ...parseGitRepo(url),
      };
    } catch {
      return null;
    }
  }

  return {
    id: nanoid(),
    type: BehaviorType.FileURL,
    url,
  };
};

const valueFromRows = (rows: Map<RowId, Behavior>): CustomBehaviorValue => {
  const values: CustomBehaviorValue = [];

  rows.forEach((item) => {
    if (!item.url) return;

    if (item.type === BehaviorType.GitRepo) {
      values.push(stringifyGitRepo(item));
    } else {
      values.push(item.url);
    }
  });

  return values;
};

const labelFor: Record<BehaviorType, string> = {
  [BehaviorType.FileURL]: msg("URL"),
  [BehaviorType.GitRepo]: msg("Git Repo"),
};

const errorFor: Record<ValidityErrorCodes, string> = {
  [APIErrorDetail.WorkflowCustomBehaviorBranchNotFound]: msg(
    "Please enter a valid branch",
  ),
  [APIErrorDetail.WorkflowCustomBehaviorNotFound]: msg(
    "Please enter an existing URL",
  ),
  [UnknownErrorCode]: msg("Please enter a valid custom behavior"),
};

const inputStyle = [
  tw`[--sl-input-background-color-hover:transparent] [--sl-input-background-color:transparent] [--sl-input-border-color-hover:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)]`,
  tw`data-[valid]:[--sl-input-border-color:transparent]`,
  tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
];

/**
 * @fires btrix-change
 * @fires btrix-invalid
 */
@customElement("btrix-custom-behaviors-table")
@localized()
export class CustomBehaviorsTable extends BtrixElement {
  @property({ type: Array })
  customBehaviors: CustomBehaviorValue = [];

  @property({ type: Boolean })
  editable = false;

  @state()
  private rows = new Map<RowId, Behavior>();

  @state()
  private validity = new Map<RowId, RowValidity>();

  @queryAll(`.${INPUT_CLASSNAME}`)
  private readonly inputs!: NodeListOf<SlInput | UrlInput>;

  public get value(): CustomBehaviorValue {
    return valueFromRows(this.rows);
  }

  public checkValidity(): boolean {
    return ![...this.inputs].some((input) => !input.checkValidity());
  }

  public reportValidity(): boolean {
    return ![...this.inputs].some((input) => !input.reportValidity());
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("customBehaviors")) {
      this.validity = new Map();

      if (!this.customBehaviors.length) {
        const id = nanoid();
        this.rows = new Map([
          [
            id,
            {
              ...EMPTY_ROW,
              id,
            },
          ],
        ]);
      } else {
        this.rows = new Map(
          this.customBehaviors
            .map(urlToBehavior)
            .filter((item): item is Behavior => item !== null)
            .map((item) => [item.id, item]),
        );
      }
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.get("rows")) {
      this.dispatchEvent(
        new CustomEvent<ChangeEventDetail>("btrix-change", {
          detail: {
            value: this.value,
          },
        }),
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
        <btrix-table-cell class="block overflow-visible break-all border-l p-0">
          ${row.type === BehaviorType.GitRepo
            ? this.renderGitRepoCell(row)
            : this.renderFileUrlCell(row)}
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

          this.rows = new Map(
            this.rows.set(row.id, {
              ...row,
              type: el.value as BehaviorType,
              path: row.path || "",
              branch: row.branch || "",
            }),
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
    const labelStyle = tw`flex inline-flex items-center justify-end border-r bg-neutral-50 p-2 text-xs leading-none text-neutral-700`;
    const pathLabel = msg("Path");
    const branchLabel = msg("Branch");

    if (!this.editable) {
      return html`
        ${this.renderReadonlyUrl(row)}
        <dl class=${subgridStyle}>
          <dt class=${clsx(labelStyle, tw`border-b`)}>${pathLabel}</dt>
          <dd class="border-b p-2">${row.path || notSpecified}</dd>
          <dt class=${labelStyle}>${branchLabel}</dt>
          <dd class="p-2">${row.branch || notSpecified}</dd>
        </dl>
      `;
    }

    return html`${this.renderUrlInput(row, {
        placeholder: msg("Enter URL to Git repository"),
      })}
      <div class=${subgridStyle}>
        <label class=${clsx(labelStyle, tw`border-b`)}>${pathLabel}</label>
        <div class="border-b">
          ${this.renderGitDetailInput(row, {
            placeholder: msg("Optional path"),
            key: "path",
          })}
        </div>
        <label class=${labelStyle}>${branchLabel}</label>
        <div>
          ${this.renderGitDetailInput(row, {
            placeholder: msg("Optional branch"),
            key: "branch",
          })}
        </div>
      </div> `;
  }

  private renderFileUrlCell(row: BehaviorFileURL) {
    if (!this.editable) {
      return this.renderReadonlyUrl(row);
    }

    return this.renderUrlInput(row, {
      placeholder: msg("Enter URL to JavaScript file"),
    });
  }

  private renderReadonlyUrl(row: Behavior) {
    return html`
      <btrix-copy-field
        class="mt-0.5"
        .value=${row.url}
        .monostyle=${false}
        .border=${false}
        .filled=${false}
      >
        <sl-tooltip slot="prefix" content=${msg("Open in New Tab")} hoist>
          <sl-icon-button
            href=${row.url}
            name="box-arrow-up-right"
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="m-px"
          >
          </sl-icon-button>
        </sl-tooltip>
      </btrix-copy-field>
    `;
  }

  private renderUrlInput(
    row: Behavior,
    { placeholder }: { placeholder: string },
  ) {
    let prefix: {
      icon: string;
      tooltip: string;
      className: string;
    } | null = null;

    const validity = this.validity.get(row.id) || {};

    if ("error" in validity) {
      prefix = {
        icon: "exclamation-lg",
        tooltip: errorFor[validity.error as ValidityErrorCodes],
        className: tw`text-danger`,
      };
    } else if ("valid" in validity) {
      prefix = {
        icon: "check-lg",
        tooltip: msg("URL is valid"),
        className: tw`text-success`,
      };
    }

    return html`
      <btrix-url-input
        placeholder=${placeholder}
        class=${clsx(inputStyle, INPUT_CLASSNAME)}
        value=${row.url}
        @sl-input=${this.onInputForRow(row)}
        @sl-change=${this.onInputChangeForKey(row, "url")}
        @sl-invalid=${() =>
          this.dispatchEvent(new CustomEvent("btrix-invalid"))}
      >
        ${when(
          prefix,
          ({ tooltip, icon, className }) => html`
            <div slot="suffix" class="inline-flex items-center">
              <sl-tooltip hoist content=${tooltip} placement="bottom-end">
                <sl-icon
                  name=${icon}
                  class=${clsx(tw`size-4 text-base`, className)}
                ></sl-icon>
              </sl-tooltip>
            </div>
          `,
        )}
      </btrix-url-input>
    `;
  }

  private renderGitDetailInput(
    row: BehaviorGitRepo,
    { placeholder, key }: { placeholder: string; key: "path" | "branch" },
  ) {
    return html`
      <sl-input
        class=${clsx(inputStyle, INPUT_CLASSNAME, key)}
        size="small"
        value=${row[key]}
        placeholder=${placeholder}
        spellcheck="false"
        @sl-input=${this.onInputForRow(row)}
        @sl-change=${this.onInputChangeForKey(row, key)}
        @sl-invalid=${() =>
          this.dispatchEvent(new CustomEvent("btrix-invalid"))}
      ></sl-input>
    `;
  }

  private readonly onInputForRow = (row: Behavior) => (e: SlInputEvent) => {
    const el = e.target as SlInput;

    el.setCustomValidity("");

    if (this.validity.get(row.id)) {
      this.validity.delete(row.id);
      this.validity = new Map(this.validity);
    }
  };

  private readonly onInputChangeForKey =
    (row: Behavior, key: string) => async (e: SlChangeEvent) => {
      const el = e.target as SlInput;
      const value = el.value.trim();

      const behavior = {
        ...row,
        [key]: value,
      };

      this.rows = new Map(this.rows.set(behavior.id, behavior));

      if (el.checkValidity() || this.validity.get(row.id)) {
        const rowEl = el.closest<TableRow>("btrix-table-row");
        const rowInputs = rowEl?.querySelectorAll<SlInput>(
          `.${INPUT_CLASSNAME}`,
        );

        const validity = await this.validateBehavior(behavior);

        let invalidInput = el;

        if (validity && "error" in validity) {
          if (
            validity.error ===
            APIErrorDetail.WorkflowCustomBehaviorBranchNotFound
          ) {
            invalidInput =
              rowEl?.querySelector<SlInput>(`.${INPUT_CLASSNAME}.branch`) || el;
          }

          rowInputs?.forEach((input) => {
            if (input === invalidInput) {
              input.setCustomValidity(errorFor[validity.error]);
            } else {
              input.setCustomValidity("");
            }
          });
        }

        invalidInput.checkValidity();
      }
    };

  private addRow() {
    const id = nanoid();

    this.rows = new Map(
      this.rows.set(id, {
        ...EMPTY_ROW,
        id,
      }),
    );
  }

  private removeRow(id: string) {
    this.rows.delete(id);
    this.validity.delete(id);

    this.rows = new Map(this.rows);
    this.validity = new Map(this.validity);
  }

  private async validateBehavior(
    behavior: Behavior,
  ): Promise<RowValidity | undefined> {
    try {
      await this.validateUrl(
        behavior.type === BehaviorType.GitRepo
          ? stringifyGitRepo(behavior)
          : behavior.url,
      );

      this.validity = new Map(this.validity.set(behavior.id, { valid: true }));
    } catch (err) {
      let errorCode: ValidityErrorCodes = UnknownErrorCode;

      if (err instanceof APIError) {
        // TODO switch to error code
        // https://github.com/webrecorder/browsertrix/issues/2512
        switch (err.details) {
          case APIErrorDetail.WorkflowCustomBehaviorNotFound:
          case APIErrorDetail.WorkflowCustomBehaviorBranchNotFound:
            errorCode = err.details;
            break;
          default:
            console.debug("unexpected API error:", err);
            break;
        }
      }

      this.validity = new Map(
        this.validity.set(behavior.id, { error: errorCode }),
      );
    }

    return this.validity.get(behavior.id);
  }

  private async validateUrl(url: string) {
    return await this.api.fetch<{ success: true }>(
      `/orgs/${this.orgId}/crawlconfigs/validate/custom-behavior`,
      {
        method: "POST",
        body: JSON.stringify({
          customBehavior: url,
        }),
      },
    );
  }
}
