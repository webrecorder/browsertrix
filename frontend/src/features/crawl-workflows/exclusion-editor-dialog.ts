import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { type RemoveExclusionEvent } from "./exclusion-editor";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
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

  @property({ type: Object, hasChanged: isNotEqual })
  config?: SeedConfig;

  @property({ type: Boolean })
  open = false;

  @state()
  private visible = false;

  @state()
  private removed = 0;

  render() {
    return html`<btrix-dialog
      class="[--body-spacing:0] [--width:--btrix-screen-desktop] part-[body]:flex part-[footer]:flex part-[panel]:h-screen part-[footer]:flex-wrap part-[body]:content-stretch part-[footer]:items-center part-[footer]:justify-end part-[body]:justify-stretch part-[footer]:gap-3 part-[body]:overflow-hidden"
      .label=${msg("Crawl Queue Editor")}
      .open=${this.open}
      @sl-show=${() => (this.visible = true)}
      @sl-after-hide=${() => (this.visible = false)}
    >
      ${this.config && this.visible
        ? html`<btrix-exclusion-editor
            .crawlId=${this.crawlId}
            .config=${this.config}
            ?isActiveCrawl=${this.activeCrawl}
            @btrix-remove=${async (e: RemoveExclusionEvent) =>
              void this.deleteExclusion({ regex: e.detail.item })}
          ></btrix-exclusion-editor>`
        : nothing}
      ${when(
        this.removed,
        (removed) =>
          html`<div slot="footer" class="flex items-center gap-1.5">
            <sl-icon
              name="check-lg"
              class="text-base text-success-500"
            ></sl-icon>
            <span class="text-neutral-600"
              >${msg("Removed")} ${this.localize.number(removed)}
              ${pluralOf("exclusions", removed)}</span
            >
          </div>`,
      )}
      <sl-button
        slot="footer"
        size="small"
        @click=${(e: MouseEvent) =>
          void (e.target as HTMLElement)
            .closest<Dialog>("btrix-dialog")
            ?.hide()}
        >${msg("Done Editing")}</sl-button
      >
    </btrix-dialog>`;
  }

  private async deleteExclusion({ regex }: { regex: string }) {
    try {
      const params = new URLSearchParams({ regex });
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.orgId}/crawls/${
          this.crawlId
        }/exclusions?${params.toString()}`,
        {
          method: "DELETE",
        },
      );

      if (data.success) {
        this.removed = this.removed + 1;

        this.dispatchEvent(new CustomEvent("btrix-saved"));
      } else {
        throw data;
      }
    } catch (e) {
      this.notify.toast({
        message:
          isApiError(e) && e.message === "crawl_running_cant_deactivate"
            ? msg("Cannot remove exclusion when crawl is no longer running.")
            : msg("Sorry, couldn't remove exclusion at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "exclusion-edit-status",
      });

      this.dispatchEvent(new CustomEvent("btrix-error"));
    }
  }
}
