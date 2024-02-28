import { type PropertyValues, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { keyed } from "lit/directives/keyed.js";
import { localized, msg, str } from "@lit/localize";
import type { SlTextarea } from "@shoelace-style/shoelace";
import { merge } from "immutable";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";
import { APIController } from "@/controllers/api";
import { NotifyController } from "@/controllers/notify";
import { type AuthState } from "@/utils/AuthService";
import type { ArchivedItemPage } from "@/types/crawler";

/**
 * Manage crawl QA page assessment
 */
@localized()
@customElement("btrix-page-qa-toolbar")
export class PageQAToolbar extends TailwindElement {
  static styles = css`
    :host {
      --btrix-border: 1px solid var(--sl-color-neutral-300);
      --btrix-border-radius: var(--sl-border-radius-large);
    }

    .group {
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      box-shadow: inset 0 0 0 1px var(--sl-color-neutral-300);
      border-radius: var(--sl-input-height-small);
      height: var(--sl-input-height-small);
    }

    .group.approved:not(.commented) {
      background-color: var(--sl-color-success-500);
    }

    .group.rejected:not(.commented) {
      background-color: var(--sl-color-danger-500);
    }

    .group.commented:not(.approved):not(.rejected) {
      background-color: var(--sl-color-blue-400);
    }

    .group.approved.commented {
      background: linear-gradient(
        to right,
        var(--sl-color-success-500),
        var(--sl-color-success-500) 33.3333%,
        var(--sl-color-blue-400) 33.3333%,
        var(--sl-color-blue-400)
      );
    }

    .group.rejected.commented {
      background: linear-gradient(
        to right,
        var(--sl-color-blue-400),
        var(--sl-color-blue-400) 66.6666%,
        var(--sl-color-danger-500) 66.6666%,
        var(--sl-color-danger-500)
      );
    }

    button {
      display: flex;
      align-items: center;
      justify-content: center;
      height: var(--sl-input-height-small);
      width: 4rem;
      border-top: var(--btrix-border);
      border-bottom: var(--btrix-border);
      box-shadow: var(--sl-shadow-x-small);
      transition:
        var(--sl-transition-x-fast) background-color,
        var(--sl-transition-x-fast) border,
        var(--sl-transition-x-fast) box-shadow,
        var(--sl-transition-x-fast) transform;
    }

    button:not(.active) {
      background-color: var(--sl-color-neutral-0);
    }

    button:first-of-type {
      border-left: var(--btrix-border);
      border-start-start-radius: var(--sl-input-height-small);
      border-end-start-radius: var(--sl-input-height-small);
    }

    button:last-of-type {
      border-right: var(--btrix-border);
      border-start-end-radius: var(--sl-input-height-small);
      border-end-end-radius: var(--sl-input-height-small);
    }

    button:first-of-type {
      border-start-end-radius: 0;
      border-end-end-radius: 0;
    }

    button:last-of-type {
      border-start-start-radius: 0;
      border-end-start-radius: 0;
    }

    button.active {
      color: var(--sl-color-neutral-0);
    }

    button.active:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }

    .vote:not(.active):hover {
      border: var(--btrix-border);
      transform: scale(1.1);
    }

    .vote:first-of-type:not(.active):hover {
      border-start-end-radius: var(--btrix-border-radius);
      border-end-end-radius: var(--btrix-border-radius);
    }

    .vote:last-of-type:not(.active):hover {
      border-start-start-radius: var(--btrix-border-radius);
      border-end-start-radius: var(--btrix-border-radius);
    }

    .approve:not(.active):hover sl-icon {
      color: var(--sl-color-success-500);
    }

    .reject:not(.active):hover sl-icon {
      color: var(--sl-color-danger-500);
    }

    .comment:not(.active):hover sl-icon {
      transform: scale(1.1);
      color: var(--sl-color-blue-400);
    }

    button.roundStart {
      border-start-start-radius: var(--btrix-border-radius);
      border-end-start-radius: var(--btrix-border-radius);
    }

    button.roundEnd {
      border-start-end-radius: var(--btrix-border-radius);
      border-end-end-radius: var(--btrix-border-radius);
    }

    button sl-icon {
      font-size: var(--font-size-base);
      transition:
        var(--sl-transition-x-fast) color,
        var(--sl-transition-x-fast) transform;
    }
  `;

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  itemId?: string;

  @property({ type: String })
  pageId?: string;

  @state()
  private page?: ArchivedItemPage;

  @state()
  private isCommentOpen = false;

  @query("btrix-dialog")
  private dialog!: Dialog;

  @query('sl-textarea[name="pageComment"]')
  private textarea!: SlTextarea;

  private api = new APIController(this);
  private notify = new NotifyController(this);

  protected willUpdate(
    changedProperties: PropertyValues<this> | Map<PropertyKey, unknown>,
  ): void {
    if (changedProperties.has("pageId") && this.pageId) {
      void this.fetchPage();
    }
  }

  render() {
    const comments = this.page?.notes || [];
    const latestComment = comments[0];
    const approved = this.page?.approved === true;
    const rejected = this.page?.approved === false;
    const commented = !!latestComment;

    return html`
      <div
        class=${classMap({
          group: true,
          approved: approved,
          commented: commented,
          rejected: rejected,
        })}
        role="radiogroup"
        aria-label=${msg("QA rating")}
      >
        <button
          class=${classMap({
            vote: true,
            approve: true,
            active: approved,
            roundEnd: !approved && commented,
          })}
          role="radio"
          aria-checked=${approved}
          ?disabled=${!this.page}
          @click=${() =>
            this.submitReview({ approved: approved ? null : true })}
        >
          <sl-icon name="hand-thumbs-up" label=${msg("Approve")}></sl-icon>
        </button>
        <button
          role="checkbox"
          class=${classMap({
            comment: true,
            active: commented,
            roundStart: !commented && approved,
            roundEnd: !commented && rejected,
          })}
          aria-checked=${commented}
          ?disabled=${!this.page}
          @click=${() => (this.isCommentOpen = true)}
        >
          <sl-icon name="chat-square-text" label=${msg("Comment")}></sl-icon>
        </button>
        <button
          role="radio"
          class=${classMap({
            vote: true,
            reject: true,
            active: rejected,
            roundStart: !rejected && commented,
          })}
          aria-checked=${rejected}
          ?disabled=${!this.page}
          @click=${() =>
            this.submitReview({ approved: rejected ? null : false })}
        >
          <sl-icon name="hand-thumbs-down" label=${msg("Reject")}></sl-icon>
        </button>
      </div>

      <btrix-dialog
        label=${msg("Page Review Comments")}
        ?open=${this.isCommentOpen}
        @sl-hide=${() => (this.isCommentOpen = false)}
      >
        ${keyed(
          this.isCommentOpen,
          html`<form @submit=${this.onSubmitComment}>
            <sl-textarea
              name="pageComment"
              label=${msg("Comment")}
              placeholder=${msg("Enter page feedback")}
              value=${latestComment?.text || ""}
              help-text=${latestComment
                ? msg(
                    str`Updated by ${latestComment.userName} on ${new Date(latestComment.modified).toLocaleDateString()}`,
                  )
                : ""}
            ></sl-textarea>
          </form>`,
        )}

        <p
          slot="footer"
          class="mb-2 rounded border border-slate-200 bg-slate-50 p-2 text-left text-neutral-500"
        >
          <sl-tag size="small" variant="primary" class="mr-1"
            >${msg("Beta Notice")}</sl-tag
          >
          ${msg(
            "We may analyze anonymized text from this comment to improve the beta QA feature.",
          )}
        </p>
        <sl-button
          slot="footer"
          size="small"
          variant="primary"
          @click=${() => this.dialog.submit()}
        >
          ${msg("Update Comment")}
        </sl-button>
      </btrix-dialog>
    `;
  }

  private async submitReview({
    approved,
  }: {
    approved: ArchivedItemPage["approved"];
  }) {
    if (!this.page) return;

    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${this.page?.id}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify({ approved }),
        },
      );
      this.page = merge<ArchivedItemPage>(this.page, { approved });

      this.notify.toast({
        message: msg("Updated page assessment."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: unknown) {
      console.debug(e);
      this.notify.toast({
        message: msg("Sorry, couldn't submit page review at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async onSubmitComment(e: SubmitEvent) {
    e.preventDefault();
    const value = this.textarea.value;

    // TODO
    const pageId = "";

    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${pageId}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify({ notes: [value] }),
        },
      );

      this.notify.toast({
        message: msg("Updated page comments."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: unknown) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't add comment at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
  private async fetchPage(): Promise<void> {
    if (!this.pageId) return;
    try {
      this.page = await this.getPage(this.pageId);
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve archived item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getPage(pageId: string): Promise<ArchivedItemPage> {
    return this.api.fetch<ArchivedItemPage>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${pageId}`,
      this.authState!,
    );
  }
}
