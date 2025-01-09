import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { ArchivedItemPage } from "@/types/crawler";

export type UpdatePageApprovalDetail = {
  id: ArchivedItemPage["id"];
  approved?: ArchivedItemPage["approved"];
};

/**
 * Manage crawl QA page approval
 *
 * @fires btrix-update-page-approval
 * @fires btrix-show-comments
 */
@customElement("btrix-page-qa-approval")
@localized()
export class PageQAToolbar extends BtrixElement {
  static styles = css`
    :host {
      --btrix-border: 1px solid var(--sl-color-neutral-300);
      --btrix-border-radius: var(--sl-border-radius-medium);
    }

    .btnGroup {
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      outline: var(--btrix-border);
      outline-offset: -1px;
      box-shadow: var(--sl-shadow-x-small);
      border-radius: var(--sl-input-height-small);
      height: var(--sl-input-height-small);
      transition: var(--sl-transition-x-fast) background-color;
    }

    .btnGroup.approved {
      background-color: var(--sl-color-success-500);
    }

    .btnGroup.rejected {
      background-color: var(--sl-color-danger-500);
    }

    .btnGroup.disabled button {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .btnGroup button {
      display: flex;
      align-items: center;
      justify-content: center;
      height: var(--sl-input-height-small);
      width: 4rem;
      border-top: var(--btrix-border);
      border-bottom: var(--btrix-border);
      transition:
        var(--sl-transition-x-fast) background-color,
        var(--sl-transition-x-fast) border,
        var(--sl-transition-x-fast) border-radius,
        var(--sl-transition-x-fast) box-shadow,
        var(--sl-transition-x-fast) transform;
    }

    .btnGroup button:first-of-type {
      border-left: var(--btrix-border);
      border-right: 1px solid transparent;
      border-start-start-radius: var(--sl-input-height-small);
      border-end-start-radius: var(--sl-input-height-small);
    }

    .btnGroup button:nth-of-type(2) {
      border-left: 1px solid transparent;
      border-right: 1px solid transparent;
    }

    .btnGroup button:last-of-type {
      border-left: 1px solid transparent;
      border-right: var(--btrix-border);
      border-start-end-radius: var(--sl-input-height-small);
      border-end-end-radius: var(--sl-input-height-small);
    }

    .rate.active {
      color: var(--sl-color-neutral-0);
    }

    .rate.active:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }

    .rate:not(.active),
    .comment {
      background-color: var(--sl-color-neutral-0);
    }

    .btnGroup:not(.disabled) .rate:not(.active):hover {
      border: var(--btrix-border);
      box-shadow: var(--sl-shadow-x-small);
      transform: scale(1.1);
    }

    .rate:first-of-type:not(.active):hover {
      border-start-end-radius: var(--sl-border-radius-large);
      border-end-end-radius: var(--sl-border-radius-large);
    }

    .rate:last-of-type:not(.active):hover {
      border-start-start-radius: var(--sl-border-radius-large);
      border-end-start-radius: var(--sl-border-radius-large);
    }

    .btnGroup:not(.disabled) .approve:not(.active):hover sl-icon {
      color: var(--sl-color-success-500);
    }

    .btnGroup:not(.disabled) .reject:not(.active):hover sl-icon {
      color: var(--sl-color-danger-500);
    }

    .btnGroup:not(.disabled) .comment:hover sl-icon {
      transform: scale(1.1);
      color: var(--sl-color-blue-500);
    }

    .comment.active sl-icon {
      color: var(--sl-color-blue-500);
    }

    .btnGroup:has(button.active:first-of-type) button:nth-of-type(2) {
      border-left: var(--btrix-border);
      border-start-start-radius: var(--btrix-border-radius);
      border-end-start-radius: var(--btrix-border-radius);
    }

    .btnGroup:has(button.active:last-of-type) button:nth-of-type(2) {
      border-right: var(--btrix-border);
      border-start-end-radius: var(--btrix-border-radius);
      border-end-end-radius: var(--btrix-border-radius);
    }

    .btnGroup button:nth-of-type(2) {
      border-left: var(--btrix-border);
      border-right: var(--btrix-border);
    }

    .btnGroup sl-icon {
      font-size: var(--font-size-base);
      transition:
        var(--sl-transition-x-fast) color,
        var(--sl-transition-x-fast) transform;
    }
  `;

  @property({ type: String, attribute: false })
  itemId?: string;

  @property({ type: String, attribute: false })
  pageId?: string;

  @property({ type: Object, attribute: false })
  page?: ArchivedItemPage;

  @property({ type: Boolean })
  disabled = false;

  render() {
    const disabled = this.disabled || !this.page;
    const approved = this.page?.approved === true;
    const rejected = this.page?.approved === false;
    const commented = Boolean(this.page?.notes?.length);

    return html`
      <fieldset
        class=${classMap({
          btnGroup: true,
          approved: approved,
          commented: commented,
          rejected: rejected,
          disabled: disabled,
        })}
        aria-label=${msg("QA rating")}
        ?disabled=${disabled}
      >
        <button
          class=${classMap({
            rate: true,
            approve: true,
            active: approved,
          })}
          aria-checked=${approved}
          ?disabled=${disabled}
          @click=${async () =>
            this.submitApproval({ approved: approved ? null : true })}
        >
          <sl-icon name="hand-thumbs-up" label=${msg("Approve")}></sl-icon>
        </button>
        <button
          role="checkbox"
          class=${classMap({
            comment: true,
            active: commented,
          })}
          aria-checked=${commented}
          ?disabled=${disabled}
          @click=${() =>
            this.dispatchEvent(new CustomEvent("btrix-show-comments"))}
        >
          <sl-icon name="chat-square-text" label=${msg("Comment")}></sl-icon>
        </button>
        <button
          class=${classMap({
            rate: true,
            reject: true,
            active: rejected,
          })}
          aria-checked=${rejected}
          ?disabled=${disabled}
          @click=${async () =>
            this.submitApproval({ approved: rejected ? null : false })}
        >
          <sl-icon name="hand-thumbs-down" label=${msg("Reject")}></sl-icon>
        </button>
      </fieldset>
    `;
  }

  private async submitApproval({
    approved,
  }: {
    approved: ArchivedItemPage["approved"];
  }) {
    if (!this.pageId) return;

    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/crawls/${this.itemId}/pages/${this.pageId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ approved }),
        },
      );

      this.dispatchEvent(
        new CustomEvent<UpdatePageApprovalDetail>(
          "btrix-update-page-approval",
          {
            detail: {
              id: this.pageId,
              approved,
            },
          },
        ),
      );
    } catch (e: unknown) {
      console.debug(e);
      this.notify.toast({
        message: msg("Sorry, couldn't submit page approval at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-page-approval-status",
      });
    }
  }
}
