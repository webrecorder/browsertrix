import { css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { localized, msg } from "@lit/localize";

import { TailwindElement } from "@/classes/TailwindElement";

@localized()
@customElement("btrix-qa-rating")
export class QARating extends TailwindElement {
  static styles = css`
    sl-button {
      width: 4rem;
    }

    sl-button::part(label) {
      font-size: var(--font-size-base);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    sl-button::part(base) {
      transition:
        var(--sl-transition-x-fast) background-color,
        var(--sl-transition-x-fast) color,
        var(--sl-transition-x-fast) border,
        var(--sl-transition-x-fast) box-shadow,
        var(--sl-transition-x-fast) transform;
    }

    sl-button::part(base):hover {
      border-color: var(--sl-color-neutral-300);
    }

    sl-button.active::part(base) {
      color: var(--sl-color-neutral-0);
    }

    sl-button:first-of-type::part(base):hover {
      border-start-end-radius: var(--sl-border-radius-medium);
      border-end-end-radius: var(--sl-border-radius-medium);
    }

    sl-button:last-of-type::part(base):hover {
      border-start-start-radius: var(--sl-border-radius-medium);
      border-end-start-radius: var(--sl-border-radius-medium);
    }

    .pass::part(base):hover,
    .fail::part(base):hover {
      background-color: var(--sl-color-neutral-0);
      transform: scale(1.1);
    }

    .pass::part(base):hover {
      color: var(--sl-color-success-600);
    }

    .pass.active::part(base) {
      background-color: var(--sl-color-success-500);
    }

    .fail.active::part(base) {
      background-color: var(--sl-color-danger-500);
    }

    .fail::part(base):hover {
      color: var(--sl-color-danger-600);
    }

    .comment.active::part(base) {
      background-color: var(--sl-color-blue-50);
      color: var(--sl-color-blue-700);
    }
  `;

  render() {
    const passed = false;
    const commented = false;
    const failed = false;

    return html`
      <sl-button-group role="radiogroup" label=${msg("QA rating")}>
        <sl-button
          role="radio"
          class=${classMap({
            pass: true,
            active: passed,
          })}
          aria-checked=${passed}
          size="small"
          pill
        >
          <sl-icon name="hand-thumbs-up" label=${msg("Pass")}></sl-icon>
        </sl-button>
        <sl-button
          role="checkbox"
          class=${classMap({
            comment: true,
            active: commented,
          })}
          aria-checked=${commented}
          size="small"
          pill
        >
          <sl-icon name="chat-square-text" label=${msg("Comment")}></sl-icon>
        </sl-button>
        <sl-button
          role="radio"
          class=${classMap({
            fail: true,
            active: failed,
          })}
          aria-checked=${failed}
          size="small"
          pill
        >
          <sl-icon name="hand-thumbs-down" label=${msg("Fail")}></sl-icon>
        </sl-button>
      </sl-button-group>
    `;
  }
}
