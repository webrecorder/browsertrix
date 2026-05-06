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

  @state()
  private autoAdd = false;

  @state()
  private dedupe = false;

  @state()
  private showSaveStatus = false;

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

        this.dispatchEvent(new CustomEvent("btrix-collection-saved"));
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
      this.#timerId = window.setTimeout(() => {
        this.showSaveStatus = false;
      }, 4000);
    }
  }

  disconnectedCallback(): void {
    window.clearTimeout(this.#timerId);
    super.disconnectedCallback();
  }

  render() {
    return html`<sl-tooltip
      placement="right"
      trigger="manual"
      ?open=${Boolean(this.showSaveStatus && this.saveStatus)}
      hoist
      @click=${() => (this.showSaveStatus = false)}
      @sl-after-hide=${() => (this.saveStatus = undefined)}
    >
      ${this.saveStatus === "success"
        ? html`<div slot="content" class="flex items-center gap-2">
            <sl-icon
              name="check-lg"
              class="text-base text-success-400"
            ></sl-icon>
            ${msg("Saved Change")}
          </div>`
        : html`<div slot="content" class="flex items-center gap-2">
            <sl-icon name="x-lg" class="text-base text-danger-400"></sl-icon>
            ${msg("Could Not Save")}
          </div>`}
      ${this.renderToggles()}
    </sl-tooltip>`;
  }

  private renderToggles() {
    const disableDedupe = Boolean(
      this.dedupeCollId && this.dedupeCollId !== this.collectionId,
    );

    return html`
      <div
        class=${clsx(
          tw`flex h-11 w-full items-center whitespace-nowrap rounded border px-3`,
          !this.collapse && tw`gap-4`,
        )}
      >
        <div class="flex grow basis-0 transition-all">
          <btrix-popover
            content="${msg(
              "This workflow is using another collection as its deduplication source.",
            )} ${msg(
              "Auto-adding new crawls to this collection may result in missing content.",
            )}"
            ?disabled=${!disableDedupe}
            placement="left"
            hoist
            @sl-hide=${stopProp}
            @sl-after-hide=${stopProp}
          >
            <sl-switch
              class="mx-[2px] inline-block"
              size="small"
              ?checked=${this.autoAdd}
              ?disabled=${!this.workflowId}
              @sl-change=${(e: CustomEvent) => {
                e.stopPropagation();

                this.autoAdd = (e.target as SlSwitch).checked;
                this.collapse = !this.autoAdd;

                this.debouncedSaveAutoAdd();
              }}
            >
              <span class="text-neutral-500">${msg("Auto-Add")}</span>
            </sl-switch>
          </btrix-popover>
        </div>
        ${when(
          this.featureFlags.has("dedupeEnabled"),
          () =>
            html`<div
              class=${clsx(
                tw`basis-0 overflow-hidden transition-all`,
                this.autoAdd ? tw`grow` : tw`shrink`,
                this.collapse && tw`w-0`,
              )}
            >
              <btrix-popover
                content=${msg(
                  "This workflow is using another collection as its deduplication source.",
                )}
                ?disabled=${!disableDedupe}
                placement="bottom-end"
                hoist
                @sl-hide=${stopProp}
                @sl-after-hide=${stopProp}
              >
                <sl-switch
                  class="mx-[2px] inline-block"
                  size="small"
                  ?checked=${this.dedupe}
                  ?disabled=${!this.workflowId || disableDedupe}
                  @click=${(e: MouseEvent) => {
                    e.stopPropagation();
                  }}
                  @sl-change=${(e: CustomEvent) => {
                    e.stopPropagation();

                    this.dedupe = (e.target as SlSwitch).checked;

                    this.debouncedSaveAutoAdd();
                  }}
                >
                  <span class="text-neutral-500">${msg("Dedupe")}</span>
                </sl-switch>
              </btrix-popover>
            </div>`,
        )}
      </div>
    `;
  }

  // Debounce auto add to prevent multiple requests when toggling too quickly
  private readonly debouncedSaveAutoAdd = debounce(200)(() => {
    void this.saveAutoAddTask.run();
  });

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
    } else if (dedupe === false) {
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

      if (this.dedupe) {
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
