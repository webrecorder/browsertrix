import { css, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { localized, msg } from "@lit/localize";
import type { SlTextarea } from "@shoelace-style/shoelace";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";

@localized()
@customElement("btrix-qa-approval-buttons")
export class QaApprovalButtons extends TailwindElement {
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

    .group.commented {
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
        var(--sl-color-neutral-0),
        var(--sl-color-neutral-0) 66.6666%,
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

    .vote.active {
      color: var(--sl-color-neutral-0);
    }

    .vote.active:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }

    .comment.active {
      color: var(--sl-color-blue-500);
    }

    .comment.active:hover {
      color: var(--sl-color-blue-300);
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

    .flatStart {
      border-left: var(--btrix-border);
    }

    .flatEnd {
      border-right: var(--btrix-border);
    }

    .roundStart {
      border-left: var(--btrix-border);
      border-start-start-radius: var(--btrix-border-radius);
      border-end-start-radius: var(--btrix-border-radius);
    }

    .roundEnd {
      border-right: var(--btrix-border);
      border-start-end-radius: var(--btrix-border-radius);
      border-end-end-radius: var(--btrix-border-radius);
    }

    sl-icon {
      font-size: var(--font-size-base);
      transition:
        var(--sl-transition-x-fast) color,
        var(--sl-transition-x-fast) transform;
    }
  `;

  @state()
  private isCommentOpen = false;

  @query("btrix-dialog")
  private dialog!: Dialog;

  @query('sl-textarea[name="pageComment"]')
  private textarea!: SlTextarea;

  render() {
    const approved = false;
    const commented = false;
    const rejected = true;

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
            flatEnd: !approved && !commented,
            roundEnd: !approved && commented,
          })}
          role="radio"
          aria-checked=${approved}
        >
          <sl-icon name="hand-thumbs-up" label=${msg("Approve")}></sl-icon>
        </button>
        <button
          role="checkbox"
          class=${classMap({
            comment: true,
            active: commented,
            flatStart: approved && commented,
            flatEnd: !approved || !commented,
            roundStart: !commented && approved,
            roundEnd: !commented && rejected,
          })}
          aria-checked=${commented}
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
        >
          <sl-icon name="hand-thumbs-down" label=${msg("Reject")}></sl-icon>
        </button>
      </div>

      <btrix-dialog
        label=${msg("Page Review Comment")}
        ?open=${this.isCommentOpen}
        @sl-hide=${() => (this.isCommentOpen = false)}
      >
        <form @submit=${this.onSubmit}>
          <sl-textarea
            name="pageComment"
            label=${msg("Comment")}
            placeholder=${msg("Enter feedback on page")}
          ></sl-textarea>
        </form>
        <p class="mt-4 text-neutral-500">
          <sl-tag size="small" variant="primary" class="mr-1"
            >${msg("Beta Feature")}</sl-tag
          >
          ${msg(
            "We may assess anonymized text from this comment to improve this beta feature.",
          )}
        </p>
        <sl-button
          slot="footer"
          size="small"
          variant="primary"
          @click=${() => this.dialog.submit()}
        >
          ${msg("Update Page Comment")}
        </sl-button>
      </btrix-dialog>
    `;
  }

  private onSubmit(e: SubmitEvent) {
    e.preventDefault();
    console.log("submit", e.target);
  }
}
