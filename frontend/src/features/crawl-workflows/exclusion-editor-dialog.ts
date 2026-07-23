import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { map } from "lit/directives/map.js";

import {
  type AddExclusionEvent,
  type RemoveExclusionEvent,
} from "./exclusion-editor";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { textSeparator } from "@/layouts/separator";
import type { SeedConfig } from "@/types/crawler";
import { isApiError } from "@/utils/api";
import { isNotEqual } from "@/utils/is-not-equal";
import { pluralOf } from "@/utils/pluralize";

/**
 * @fires btrix-saved
 * @fires btrix-error
 */
@customElement("btrix-exclusion-editor-dialog")
@localized()
export class ExclusionEditorDialog extends BtrixElement {
  @property({ type: String })
  crawlId?: string;

  @property({ type: Boolean })
  activeCrawl?: boolean;

  @property({ attribute: false, hasChanged: isNotEqual })
  exclusions?: SeedConfig["exclude"];

  @property({ type: Boolean })
  open = false;

  @state()
  private visible = false;

  @state()
  private added = new Set<string>();

  @state()
  private removed = new Set<string>();

  private readonly addRuleTask = new Task(this, {
    autoRun: false,
    task: async ([regex], { signal }) => {
      if (!regex) return;
      try {
        await this.addRule(regex, signal);

        if (this.removed.has(regex)) {
          this.removed = this.removed.difference(new Set([regex]));
        } else {
          this.added = this.added.add(regex);
        }

        this.dispatchEvent(new CustomEvent("btrix-saved"));
      } catch (err) {
        if (signal.aborted) return;

        let error = msg("Sorry, couldn't add exclusion at this time.");

        if (isApiError(err)) {
          if (err.message === "exclusion_already_exists") {
            error = msg("Exclusion already exists");
          } else if (err.message === "invalid_regex") {
            error = msg("Invalid Regex");
          }
        }

        this.dispatchEvent(new CustomEvent("btrix-error"));

        throw error;
      }
    },
    args: () => [undefined] as readonly [string | undefined],
  });

  private readonly deleteRuleTask = new Task(this, {
    autoRun: false,
    task: async ([regex], { signal }) => {
      if (!regex) return;
      try {
        await this.deleteRule(regex, signal);

        if (this.added.has(regex)) {
          this.added = this.added.difference(new Set([regex]));
        } else {
          this.removed = this.removed.add(regex);
        }

        this.dispatchEvent(new CustomEvent("btrix-saved"));
      } catch (err) {
        if (signal.aborted) return;

        let error = msg("Sorry, couldn't remove exclusion at this time.");

        if (
          isApiError(err) &&
          err.message === "crawl_running_cant_deactivate"
        ) {
          error = msg(
            "Cannot remove exclusion when crawl is no longer running.",
          );
        }

        this.dispatchEvent(new CustomEvent("btrix-error"));

        throw error;
      }
    },
    args: () => [undefined] as readonly [string | undefined],
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("open")) {
      this.visible = this.open;
    }
  }

  render() {
    const errorMessage =
      this.addRuleTask.render({ error: (errorMessage) => errorMessage }) ||
      this.deleteRuleTask.render({ error: (errorMessage) => errorMessage });

    return html`<btrix-dialog
      class="[--body-spacing:0] [--width:calc(var(--btrix-screen-desktop)-3.5rem)] part-[body]:flex part-[footer]:flex part-[panel]:h-screen part-[footer]:flex-wrap part-[body]:content-stretch part-[footer]:items-center part-[header-actions]:items-center part-[footer]:justify-end part-[body]:justify-stretch part-[footer]:gap-3 part-[body]:overflow-hidden part-[title]:overflow-hidden"
      .label=${msg("Edit Exclusion Rules")}
      .open=${this.open}
      @sl-show=${() => (this.visible = true)}
      @sl-after-hide=${() => (this.visible = false)}
    >
      <slot name="dialog-label" slot="label"></slot>
      <btrix-popover
        slot="header-actions"
        content="${msg(
          "Add or remove exclusion rules to filter URLs out from the page queue.",
        )} ${msg(
          "Edited exclusion rules will apply to the current crawl run and to subsequent crawl runs.",
        )}"
        placement="bottom-end"
        hoist
      >
        <sl-icon name="question-circle" class="text-neutral-600"></sl-icon>
      </btrix-popover>
      ${this.exclusions && this.visible
        ? html`<btrix-exclusion-editor
            class="block size-full overflow-hidden"
            .crawlId=${this.crawlId}
            .exclusions=${this.exclusions}
            ?isActiveCrawl=${this.activeCrawl}
            formErrorMessage=${ifDefined(
              typeof errorMessage === "string" ? errorMessage : undefined,
            )}
            ?submitting=${this.addRuleTask.status === TaskStatus.PENDING}
            @btrix-add=${(e: AddExclusionEvent) =>
              void this.addRuleTask.run([e.detail.item])}
            @btrix-remove=${async (e: RemoveExclusionEvent) =>
              void this.deleteRuleTask.run([e.detail.item])}
          ></btrix-exclusion-editor>`
        : nothing}
      ${this.renderConfirmation()}
      <sl-button
        slot="footer"
        size="small"
        @click=${(e: MouseEvent) =>
          void (e.target as HTMLElement)
            .closest<Dialog>("btrix-dialog")
            ?.hide()}
        >${msg("Done")}</sl-button
      >
    </btrix-dialog>`;
  }

  private renderConfirmation() {
    if (!this.added.size && !this.removed.size) return;

    const added = this.added;
    const removed = this.removed;

    const list = (set: Set<string>) => html`
      <ul slot="content" class="list-disc px-2">
        ${map(set, (value) => html`<li class="font-mono">${value}</li>`)}
      </ul>
    `;

    return html`
      <div
        slot="footer"
        class="flex cursor-default items-center gap-1.5 text-neutral-600"
      >
        <sl-icon name="check-lg" class="text-base text-success-500"></sl-icon>
        ${added.size
          ? html`<btrix-popover>
              ${list(added)}
              <span
                >${msg("Added")} ${this.localize.number(added.size)}
                ${added.size && removed.size
                  ? nothing
                  : pluralOf("exclusions", added.size)}</span
              >
            </btrix-popover>`
          : nothing}
        ${added.size && removed.size ? textSeparator() : nothing}
        ${removed.size
          ? html`<btrix-popover>
              ${list(removed)}
              <span
                >${msg("Removed")} ${this.localize.number(removed.size)}
                ${pluralOf("exclusions", removed.size)}</span
              >
            </btrix-popover>`
          : nothing}
      </div>
    `;
  }

  private async deleteRule(regex: string, signal: AbortSignal) {
    const params = new URLSearchParams({ regex });

    return this.api.fetch<{ success: boolean }>(
      `/orgs/${this.orgId}/crawls/${
        this.crawlId
      }/exclusions?${params.toString()}`,
      {
        method: "DELETE",
        signal,
      },
    );
  }

  private async addRule(regex: string, signal: AbortSignal) {
    const params = new URLSearchParams({ regex });
    return this.api.fetch<{ success: boolean }>(
      `/orgs/${this.orgId}/crawls/${
        this.crawlId
      }/exclusions?${params.toString()}`,
      {
        method: "POST",
        signal,
      },
    );
  }
}
