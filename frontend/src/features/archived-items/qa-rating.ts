import { css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { localized, msg } from "@lit/localize";

import { TailwindElement } from "@/classes/TailwindElement";

@localized()
@customElement("btrix-qa-rating")
export class QARating extends TailwindElement {
  static styles = css`
    :host {
      --btrix-border: 1px solid var(--sl-color-neutral-300);
      --btrix-border-radius: var(--sl-border-radius-medium);
    }

    .group {
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      box-shadow: inset 0 0 0 1px var(--sl-color-neutral-300);
      border-radius: var(--sl-input-height-small);
      height: var(--sl-input-height-small);
    }

    .group.passed:not(.commented) {
      background-color: var(--sl-color-success-500);
    }

    .group.failed:not(.commented) {
      background-color: var(--sl-color-danger-500);
    }

    .group.commented {
      background-color: var(--sl-color-blue-400);
    }

    .group.passed.commented {
      background: linear-gradient(
        to right,
        var(--sl-color-success-500),
        var(--sl-color-success-500) 33.3333%,
        var(--sl-color-blue-400) 33.3333%,
        var(--sl-color-blue-400)
      );
    }

    .group.failed.commented {
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

    .pass:not(.active):hover sl-icon {
      color: var(--sl-color-success-500);
    }

    .fail:not(.active):hover sl-icon {
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

  render() {
    const passed = false;
    const commented = false;
    const failed = true;

    return html`
      <div
        class=${classMap({
          group: true,
          passed: passed,
          commented: commented,
          failed: failed,
        })}
        role="radiogroup"
        aria-label=${msg("QA rating")}
      >
        <button
          class=${classMap({
            vote: true,
            pass: true,
            active: passed,
            flatEnd: !passed && !commented,
            roundEnd: !passed && commented,
          })}
          role="radio"
        >
          <sl-icon name="hand-thumbs-up" label=${msg("Pass")}></sl-icon>
        </button>
        <button
          role="checkbox"
          class=${classMap({
            comment: true,
            active: commented,
            flatStart: passed && commented,
            flatEnd: !passed || !commented,
            roundStart: !commented && passed,
            roundEnd: !commented && failed,
          })}
        >
          <sl-icon name="chat-square-text" label=${msg("Comment")}></sl-icon>
        </button>
        <button
          role="radio"
          class=${classMap({
            vote: true,
            fail: true,
            active: failed,
            roundStart: !failed && commented,
          })}
        >
          <sl-icon name="hand-thumbs-down" label=${msg("Fail")}></sl-icon>
        </button>
      </div>
    `;
  }
}
