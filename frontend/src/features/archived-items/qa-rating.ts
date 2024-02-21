import { css, html } from "lit";
import { customElement } from "lit/decorators.js";
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

    sl-button.active::part(base) {
      color: var(--sl-color-neutral-0);
    }

    .pass.active::part(base) {
      background-color: var(--sl-color-success-500);
    }

    .comment.active::part(base) {
      background-color: var(--sl-color-blue-50);
      color: var(--sl-color-blue-700);
    }

    .fail.active::part(base) {
      background-color: var(--sl-color-danger-500);
    }
  `;

  render() {
    return html`
      <sl-button-group label=${msg("QA rating")}>
        <sl-button class="pass" size="small" pill>
          <sl-icon name="hand-thumbs-up" label=${msg("Pass")}></sl-icon>
        </sl-button>
        <sl-button class="comment active" size="small" pill>
          <sl-icon name="chat-square-text" label=${msg("Comment")}></sl-icon>
        </sl-button>
        <sl-button class="fail active" size="small" pill>
          <sl-icon name="hand-thumbs-down" label=${msg("Fail")}></sl-icon>
        </sl-button>
      </sl-button-group>
    `;
  }
}
