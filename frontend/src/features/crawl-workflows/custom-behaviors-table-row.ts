import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlChangeEvent,
  SlInput,
  SlInputEvent,
  SlSelect,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { css, html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { UrlInput } from "@/components/ui/url-input";
import { notSpecified } from "@/layouts/empty";
import { APIErrorDetail } from "@/types/api";
import type { SeedConfig } from "@/types/crawler";
import { APIError } from "@/utils/api";
import { tw } from "@/utils/tailwind";

export type CustomBehaviors = SeedConfig["customBehaviors"];
export type CustomBehaviorSource = CustomBehaviors[number];
export enum CustomBehaviorType {
  FileURL = "fileUrl",
  GitRepo = "gitRepo",
}

const ValidationErrorCodes = [
  APIErrorDetail.InvalidCustomBehavior,
  APIErrorDetail.CustomBehaviorBranchNotFound,
  APIErrorDetail.CustomBehaviorNotFound,
] as const;
type ValidationErrorCode = (typeof ValidationErrorCodes)[number];
type RowValidation = { success: true };

type BehaviorBase = {
  type: CustomBehaviorType;
  url: string;
  path?: string;
  branch?: string;
};

export type BehaviorFileURL = BehaviorBase & {
  type: CustomBehaviorType.FileURL;
};

export type BehaviorGitRepo = Required<BehaviorBase> & {
  type: CustomBehaviorType.GitRepo;
};

export type ChangeEventDetail = {
  value: CustomBehaviorSource;
};

export type RemoveEventDetail = {
  item: CustomBehaviorSource;
};

const labelFor: Record<CustomBehaviorType, string> = {
  [CustomBehaviorType.FileURL]: msg("URL"),
  [CustomBehaviorType.GitRepo]: msg("Git Repo"),
};

const errorFor: Record<ValidationErrorCode, string> = {
  [APIErrorDetail.InvalidCustomBehavior]: msg("Please enter a valid URL"),
  [APIErrorDetail.CustomBehaviorBranchNotFound]: msg(
    "Please enter a valid branch",
  ),
  [APIErrorDetail.CustomBehaviorNotFound]: msg("Please enter an existing URL"),
};

const inputStyle = [
  tw`[--sl-input-background-color-hover:transparent] [--sl-input-background-color:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)] [--sl-input-border-color-hover:transparent]`,
  tw`data-[valid]:[--sl-input-border-color:transparent]`,
  tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
];

const INPUT_CLASSNAME = "input";
const INVALID_CLASSNAME = "invalid";
export const GIT_PREFIX = "git+";
export const isGitRepo = (url: CustomBehaviorSource) =>
  url.startsWith(GIT_PREFIX);
export const stringifyGitRepo = (behavior: BehaviorGitRepo): string => {
  return `${GIT_PREFIX}${behavior.url}?branch=${behavior.branch}&path=${behavior.path}`;
};
export const stringifyBehavior = (behavior: BehaviorBase): string => {
  if (!behavior.url) return "";

  if (behavior.type === CustomBehaviorType.GitRepo) {
    return stringifyGitRepo(behavior as BehaviorGitRepo);
  }
  return behavior.url;
};
const parseGitRepo = (repoUrl: string): Omit<BehaviorGitRepo, "type"> => {
  const url = new URL(repoUrl.slice(GIT_PREFIX.length));

  return {
    url: `${url.origin}${url.pathname}`,
    path: url.searchParams.get("path") || "",
    branch: url.searchParams.get("branch") || "",
  };
};
export const parseBehavior = (url: string): BehaviorBase => {
  if (!url) {
    return {
      type: CustomBehaviorType.GitRepo,
      url: "",
      path: "",
      branch: "",
    };
  }

  if (isGitRepo(url)) {
    try {
      return {
        type: CustomBehaviorType.GitRepo,
        ...parseGitRepo(url),
      };
    } catch {
      return {
        type: CustomBehaviorType.GitRepo,
        url: "",
        path: "",
        branch: "",
      };
    }
  }

  return {
    type: CustomBehaviorType.FileURL,
    url,
  };
};

/**
 * @fires btrix-change
 * @fires btrix-invalid
 * @fires btrix-remove
 */
@customElement("btrix-custom-behaviors-table-row")
@localized()
export class CustomBehaviorsTableRow extends BtrixElement {
  static styles = css`
    :host {
      display: contents;
    }
  `;

  @property({ type: String })
  behaviorSource?: string;

  @property({ type: Boolean })
  editable = false;

  @state()
  private behavior?: BehaviorBase;

  @queryAll(`.${INPUT_CLASSNAME}`)
  private readonly inputs!: NodeListOf<SlInput | UrlInput>;

  @query(`#url`)
  private readonly urlInput?: UrlInput | null;

  @query(`#branch`)
  private readonly branchInput?: SlInput | null;

  @query(`#path`)
  private readonly pathInput?: SlInput | null;

  public get taskComplete() {
    return this.validateTask.taskComplete;
  }

  public checkValidity(): boolean {
    return ![...this.inputs].some((input) => !input.checkValidity());
  }

  public reportValidity(): boolean {
    return ![...this.inputs].some((input) => !input.reportValidity());
  }

  private readonly validateTask = new Task(this, {
    task: async ([behaviorSource], { signal }) => {
      if (!behaviorSource) {
        return null;
      }

      try {
        return await this.validateBehavior(behaviorSource, signal);
      } catch (err) {
        if (
          typeof err === "string" &&
          ValidationErrorCodes.includes(err as ValidationErrorCode)
        ) {
          this.setInputCustomValidity(err);
          throw err;
        }

        if (err instanceof Error && err.name === "AbortError") {
          console.debug(err);
        } else {
          console.error(err);
        }
      }
    },
    args: () => [this.behaviorSource] as const,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("behaviorSource")) {
      this.behavior = parseBehavior(this.behaviorSource || "");
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.has("behavior") && this.behavior) {
      this.dispatchEvent(
        new CustomEvent<ChangeEventDetail>("btrix-change", {
          detail: {
            value: stringifyBehavior(this.behavior),
          },
        }),
      );
    }
  }

  render() {
    const behavior = this.behavior;

    if (!behavior) return;

    return html`
      <btrix-table-row class="border-t">
        <btrix-table-cell
          class=${clsx(
            this.editable
              ? tw`h-[var(--sl-input-height-medium)] p-1`
              : tw`items-start`,
          )}
        >
          ${this.renderType(behavior)}
        </btrix-table-cell>
        <btrix-table-cell
          class=${clsx(
            tw`block border-l p-0`,
            this.editable ? tw`overflow-visible` : tw`overflow-auto`,
          )}
        >
          ${behavior.type === CustomBehaviorType.GitRepo
            ? this.renderGitRepoCell(behavior as BehaviorGitRepo)
            : this.renderFileUrlCell(behavior as BehaviorFileURL)}
        </btrix-table-cell>
        ${when(
          this.editable,
          () => html`
            <btrix-table-cell class="border-l p-1">
              <sl-icon-button
                class="text-base hover:text-danger"
                name="trash3"
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent<RemoveEventDetail>("btrix-remove"),
                  )}
              ></sl-icon-button>
            </btrix-table-cell>
          `,
        )}
      </btrix-table-row>
    `;
  }

  private renderType(behavior: BehaviorBase) {
    if (!this.editable) {
      return html`${labelFor[behavior.type]}`;
    }

    return html`
      <sl-select
        placeholder=${msg("Select Source")}
        size="small"
        class="w-[8em]"
        value=${behavior.type}
        @sl-change=${(e: SlChangeEvent) => {
          const el = e.target as SlSelect;

          this.behavior = {
            ...behavior,
            type: el.value as CustomBehaviorType,
            path: behavior.path || "",
            branch: behavior.branch || "",
          };
        }}
      >
        ${Object.values(CustomBehaviorType).map(
          (behaviorType) => html`
            <sl-option value=${behaviorType} class="whitespace-nowrap">
              ${labelFor[behaviorType]}
            </sl-option>
          `,
        )}
      </sl-select>
    `;
  }

  private renderGitRepoCell(behavior: BehaviorGitRepo) {
    const subgridStyle = tw`grid grid-cols-[max-content_1fr] border-t`;
    const labelStyle = tw`flex inline-flex items-center justify-end border-r bg-neutral-50 p-2 text-xs leading-none text-neutral-700`;
    const pathLabel = msg("Path");
    const branchLabel = msg("Branch");

    if (!this.editable) {
      return html`
        ${this.renderReadonlyUrl(behavior)}
        <dl class=${subgridStyle}>
          <dt class=${clsx(labelStyle, tw`border-b`)}>${pathLabel}</dt>
          <dd class="border-b p-2">${behavior.path || notSpecified}</dd>
          <dt class=${labelStyle}>${branchLabel}</dt>
          <dd class="p-2">${behavior.branch || notSpecified}</dd>
        </dl>
      `;
    }

    return html`${this.renderUrlInput(behavior, {
        placeholder: msg("Enter URL to Git repository"),
      })}
      <div class=${subgridStyle}>
        <label for="path" class=${clsx(labelStyle, tw`border-b`)}
          >${pathLabel}</label
        >
        <div class="border-b">
          ${this.renderGitDetailInput(behavior, {
            placeholder: msg("Optional path"),
            key: "path",
          })}
        </div>
        <label for="branch" class=${labelStyle}>${branchLabel}</label>
        <div>
          ${this.renderGitDetailInput(behavior, {
            placeholder: msg("Optional branch"),
            key: "branch",
          })}
        </div>
      </div> `;
  }

  private renderFileUrlCell(behavior: BehaviorFileURL) {
    if (!this.editable) {
      return this.renderReadonlyUrl(behavior);
    }

    return this.renderUrlInput(behavior, {
      placeholder: msg("Enter location of behavior file"),
    });
  }

  private renderReadonlyUrl(behavior: BehaviorBase) {
    return html`
      <btrix-copy-field
        class="mt-0.5"
        .value=${behavior.url}
        .monostyle=${false}
        .border=${false}
        .filled=${false}
      >
        <sl-tooltip slot="prefix" content=${msg("Open in New Tab")} hoist>
          <sl-icon-button
            href=${behavior.url}
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
    behavior: BehaviorBase,
    { placeholder }: { placeholder: string },
  ) {
    return html`
      <btrix-url-input
        id="url"
        placeholder=${placeholder}
        class=${clsx(inputStyle, INPUT_CLASSNAME)}
        value=${behavior.url}
        @sl-input=${this.onInput}
        @sl-change=${this.onInputChangeForKey(behavior, "url")}
        @sl-invalid=${() =>
          this.dispatchEvent(new CustomEvent("btrix-invalid"))}
      >
        ${this.validateTask.render({
          pending: this.renderPendingValidation,
          complete: this.renderValidTooltip,
          error: this.renderInvalidTooltip,
        })}
      </btrix-url-input>
    `;
  }

  private readonly renderPendingValidation = () => {
    return html`
      <div slot="suffix" class="inline-flex items-center">
        <sl-spinner class="size-4 text-base"></sl-spinner>
      </div>
    `;
  };

  private readonly renderInvalidTooltip = (err: unknown) => {
    const message =
      typeof err === "string" && errorFor[err as ValidationErrorCode];

    if (!message) {
      console.debug("no message for error:", err);
      return;
    }

    return html`
      <div slot="suffix" class="inline-flex items-center">
        <sl-tooltip hoist content=${message} placement="bottom-end">
          <sl-icon
            name="exclamation-lg"
            class="size-4 text-base text-danger"
          ></sl-icon>
        </sl-tooltip>
      </div>
    `;
  };

  private readonly renderValidTooltip = (
    validation: typeof this.validateTask.value,
  ) => {
    if (!validation) return;

    return html`
      <div slot="suffix" class="inline-flex items-center">
        <sl-tooltip hoist content=${msg("URL is valid")} placement="bottom-end">
          <sl-icon
            name="check-lg"
            class="size-4 text-base text-success"
          ></sl-icon>
        </sl-tooltip>
      </div>
    `;
  };

  private renderGitDetailInput(
    behavior: BehaviorGitRepo,
    { placeholder, key }: { placeholder: string; key: "path" | "branch" },
  ) {
    return html`
      <sl-input
        id=${key}
        class=${clsx(inputStyle, INPUT_CLASSNAME, key)}
        size="small"
        value=${behavior[key]}
        placeholder=${placeholder}
        spellcheck="false"
        @sl-input=${this.onInput}
        @sl-change=${this.onInputChangeForKey(behavior, key)}
        @sl-invalid=${() =>
          this.dispatchEvent(new CustomEvent("btrix-invalid"))}
      ></sl-input>
    `;
  }

  private readonly onInput = (e: SlInputEvent) => {
    const el = e.target as SlInput;

    el.classList.remove(INVALID_CLASSNAME);
    el.setCustomValidity("");
  };

  private readonly onInputChangeForKey =
    (behavior: BehaviorBase, key: string) => async (e: SlChangeEvent) => {
      const el = e.target as SlInput;
      const value = el.value.trim();

      this.behavior = {
        ...behavior,
        [key]: value,
      };
    };

  private setInputCustomValidity(error: unknown) {
    const updateValidity = (
      input: SlInput | null | undefined,
      error?: ValidationErrorCode,
    ) => {
      if (!input) return;

      if (error) {
        input.classList.add(INVALID_CLASSNAME);
      } else {
        input.classList.remove(INVALID_CLASSNAME);
      }

      input.setCustomValidity(error ? errorFor[error] : "");
    };

    switch (error) {
      case APIErrorDetail.InvalidCustomBehavior: {
        updateValidity(this.urlInput, APIErrorDetail.InvalidCustomBehavior);
        updateValidity(this.branchInput);
        updateValidity(this.pathInput);
        break;
      }
      case APIErrorDetail.CustomBehaviorBranchNotFound: {
        updateValidity(
          this.branchInput,
          APIErrorDetail.CustomBehaviorBranchNotFound,
        );
        break;
      }
      case APIErrorDetail.CustomBehaviorNotFound: {
        updateValidity(this.urlInput, APIErrorDetail.CustomBehaviorNotFound);
        updateValidity(this.branchInput);
        updateValidity(this.pathInput);
        break;
      }
      default:
        break;
    }
  }

  private async validateBehavior(
    behaviorSource: CustomBehaviorSource,
    signal: AbortSignal,
  ): Promise<RowValidation | undefined> {
    try {
      return await this.api.fetch<RowValidation>(
        `/orgs/${this.orgId}/crawlconfigs/validate/custom-behavior`,
        {
          method: "POST",
          body: JSON.stringify({
            customBehavior: behaviorSource,
          }),
          signal,
        },
      );
    } catch (err) {
      if (err instanceof APIError) {
        throw err.errorCode;
      }

      throw err;
    }
  }
}
