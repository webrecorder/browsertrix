import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlSwitch } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";
import union from "lodash/fp/union";
import without from "lodash/fp/without";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Workflow } from "@/types/crawler";
import { stopProp } from "@/utils/events";
import { isNotEqual } from "@/utils/is-not-equal";
import { tw } from "@/utils/tailwind";

/**
 * Additional settings for each workflow in `<btrix-collection-workflow-list>`
 *
 * @fires btrix-workflow-after-save
 */
@customElement("btrix-collection-workflow-list-settings")
@localized()
export class CollectionWorkflowListSettings extends BtrixElement {
  @property({ type: String })
  workflowId = "";

  @property({ type: String })
  collectionId = "";

  @property({ type: String })
  dedupeCollId = "";

  @property({ type: Array, hasChanged: isNotEqual })
  autoAddCollections: string[] = [];

  @property({ type: Boolean })
  collapse = false;

  @property({ type: Boolean })
  showSaveStatus = false;

  @state()
  private autoAdd = false;

  @state()
  private dedupe = false;

  @state()
  private saving?: "autoAdd" | "dedupe";

  @state()
  private saveStatus?: "success" | "error";

  #timerId?: number;

  private readonly saveAutoAddTask = new Task(this, {
    autoRun: false,
    task: async ([autoAdd, dedupe], { signal }) => {
      window.clearTimeout(this.#timerId);
      this.showSaveStatus = false;

      try {
        await this.saveAutoAdd({ autoAdd, dedupe }, signal);

        this.saveStatus = "success";
        this.showSaveStatus = true;

        this.dispatchEvent(new CustomEvent("btrix-workflow-after-save"));
      } catch (err) {
        console.debug(err);

        if (!signal.aborted) {
          this.saveStatus = "error";
          this.showSaveStatus = true;
        }
      }
    },
    args: () => [this.autoAdd, this.dedupe] as const,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("collectionId") ||
      changedProperties.has("autoAddCollections")
    ) {
      this.autoAdd = this.autoAddCollections.some(
        (id) => id === this.collectionId,
      );
      this.dedupe = Boolean(
        this.dedupeCollId && this.dedupeCollId === this.collectionId,
      );
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.has("saveStatus") && this.saveStatus !== undefined) {
      // Reset success status
      this.#timerId = window.setTimeout(
        () => {
          this.showSaveStatus = false;
        },
        this.saveStatus === "success" ? 3000 : 5000,
      );
    }
  }

  disconnectedCallback(): void {
    window.clearTimeout(this.#timerId);
    super.disconnectedCallback();
  }

  render() {
    const disableDedupe = Boolean(
      this.dedupeCollId && this.dedupeCollId !== this.collectionId,
    );
    const tooltipContent =
      this.saveStatus === "success"
        ? html`<div slot="content" class="flex items-center gap-2">
            <sl-icon
              name="check-lg"
              class="text-base text-success-400"
            ></sl-icon>
            ${msg("Saved")}
          </div>`
        : html`<div slot="content" class="flex items-center gap-2">
            <sl-icon name="x-lg" class="text-base text-danger-400"></sl-icon>
            ${msg("Could Not Save")}
          </div>`;

    const tooltipClick = () => (this.showSaveStatus = false);
    const tooltipHide = stopProp;
    const tooltipAfterHide = (e: CustomEvent) => {
      e.stopPropagation();
      this.saveStatus = undefined;
    };

    return html`
      <div
        class=${clsx(
          tw`flex h-11 w-full items-center whitespace-nowrap rounded border px-3`,
          !this.collapse && tw`gap-4`,
        )}
      >
        <div class="flex grow basis-0 items-center transition-all">
          <sl-tooltip
            trigger="manual"
            placement="left"
            distance="10"
            ?open=${Boolean(this.showSaveStatus && this.saveStatus)}
            ?disabled=${this.saving !== "autoAdd"}
            hoist
            @click=${tooltipClick}
            @sl-hide=${tooltipHide}
            @sl-after-hide=${tooltipAfterHide}
          >
            ${tooltipContent}
            <sl-switch
              class="mx-[2px] inline-block"
              size="small"
              ?checked=${this.autoAdd}
              ?disabled=${!this.workflowId}
              @sl-change=${(e: CustomEvent) => {
                e.stopPropagation();

                this.autoAdd = (e.target as SlSwitch).checked;

                if (!disableDedupe) {
                  this.collapse = !this.autoAdd;
                }

                this.debouncedSaveAutoAdd("autoAdd");
              }}
            >
              <span class="text-neutral-500">${msg("Auto-Add")}</span>
            </sl-switch>
          </sl-tooltip>
        </div>
        ${when(
          this.featureFlags.has("dedupeEnabled"),
          () =>
            html`<div
              class=${clsx(
                tw`overflow-hidden transition-all`,
                !disableDedupe && [
                  tw`basis-0`,
                  this.autoAdd ? tw`grow` : tw`shrink`,
                ],
                this.collapse && !disableDedupe && tw`w-0`,
              )}
            >
              ${disableDedupe
                ? html`
                    <btrix-popover
                      content="${msg(
                        "This workflow is using another collection as its deduplication source.",
                      )} ${msg(
                        "Auto-adding new crawls to this collection may result in missing content.",
                      )}"
                      placement="bottom-end"
                      hoist
                    >
                      <sl-icon
                        class=${clsx(
                          tw`mt-px block text-base text-neutral-500`,
                          this.collapse && `ml-2.5`,
                        )}
                        name="exclamation-diamond"
                      ></sl-icon>
                    </btrix-popover>
                  `
                : html`<sl-tooltip
                    trigger="manual"
                    placement="right"
                    distance="10"
                    ?open=${Boolean(this.showSaveStatus && this.saveStatus)}
                    ?disabled=${this.saving !== "dedupe"}
                    hoist
                    @click=${tooltipClick}
                    @sl-hide=${tooltipHide}
                    @sl-after-hide=${tooltipAfterHide}
                  >
                    ${tooltipContent}
                    <sl-switch
                      class="mx-[2px] inline-block"
                      size="small"
                      ?checked=${this.dedupe}
                      ?disabled=${!this.workflowId}
                      @sl-change=${(e: CustomEvent) => {
                        e.stopPropagation();

                        this.dedupe = (e.target as SlSwitch).checked;

                        this.debouncedSaveAutoAdd(
                          this.collapse ? "autoAdd" : "dedupe",
                        );
                      }}
                    >
                      <span class="text-neutral-500">${msg("Dedupe")}</span>
                    </sl-switch>
                  </sl-tooltip>`}
            </div>`,
        )}
      </div>
    `;
  }

  // Debounce auto add to prevent multiple requests when toggling too quickly
  private readonly debouncedSaveAutoAdd = debounce(200)(
    (field: "autoAdd" | "dedupe") => {
      this.saving = field;
      void this.saveAutoAddTask.run();
    },
  );

  private async saveAutoAdd(
    {
      autoAdd,
      dedupe,
    }: {
      autoAdd?: boolean;
      dedupe?: boolean;
    },
    signal: AbortSignal,
  ) {
    const params: {
      autoAddCollections?: Workflow["autoAddCollections"];
      dedupeCollId?: string;
    } = {};

    if (dedupe === true) {
      params.dedupeCollId = this.collectionId;
    } else if (dedupe === false && this.dedupeCollId === this.collectionId) {
      params.dedupeCollId = "";
    }

    if (autoAdd === true) {
      params.autoAddCollections = union(
        [this.collectionId],
        this.autoAddCollections,
      );
    } else if (autoAdd === false) {
      params.autoAddCollections = without(
        [this.collectionId],
        this.autoAddCollections,
      );

      if (this.dedupeCollId === this.collectionId) {
        params.dedupeCollId = "";
      }
    }

    return this.api.fetch(
      `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}`,
      {
        method: "PATCH",
        body: JSON.stringify(params),
        signal,
      },
    );
  }
}
