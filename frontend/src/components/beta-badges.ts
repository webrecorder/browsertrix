import { localized, msg } from "@lit/localize";
import { type SlTooltip } from "@shoelace-style/shoelace";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

const styles = css`
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  @layer components {
    :host {
      @apply contents !leading-[0];
    }
    sl-tooltip {
      @apply [--max-width:theme(spacing.64)];
    }
    sl-tooltip::part(body),
    sl-tooltip::part(base__arrow) {
      @apply bg-theme-green;
    }

    sl-tooltip::part(body) {
      @apply w-auto text-balance text-white;
    }
  }
`;

@localized()
@customElement("btrix-beta-icon")
export class BetaIcon extends TailwindElement {
  static styles = styles;
  render() {
    return html`<sl-tooltip content=${msg("Beta feature")} hoist>
      <sl-icon
        name="stars"
        label="Beta"
        class="h-4 w-4 text-theme-green"
      ></sl-icon>
    </sl-tooltip>`;
  }
}

@localized()
@customElement("btrix-beta-badge")
export class BetaBadge extends TailwindElement {
  @property({ type: String })
  placement: SlTooltip["placement"] = "top";

  static styles = styles;

  render() {
    return html`<sl-tooltip hoist placement=${this.placement}>
      <div slot="content">
        <b>${msg("This part of Browsertrix is in beta!")}</b>
        ${msg(
          "Parts might change or be broken. Please share your thoughts with us!",
        )}
      </div>
      <span class="inline-block align-middle text-xs text-theme-green">
        <sl-icon
          name="stars"
          label="Beta feature"
          class="h-4 w-4 align-middle"
        ></sl-icon
        >&nbsp;${msg("Beta")}
      </span>
    </sl-tooltip>`;
  }
}
