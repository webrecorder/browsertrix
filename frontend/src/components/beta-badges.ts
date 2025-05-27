import { localized, msg } from "@lit/localize";
import { type SlTooltip } from "@shoelace-style/shoelace";
import { html, unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";

import stylesheet from "./beta-badges.stylesheet.css";

import { TailwindElement } from "@/classes/TailwindElement";

const styles = unsafeCSS(stylesheet);

@customElement("btrix-beta-icon")
@localized()
export class BetaIcon extends TailwindElement {
  static styles = styles;
  render() {
    return html`<sl-tooltip hoist>
      <sl-icon
        name="flask-fill"
        library="app"
        label="Beta"
        class="size-4 text-brand-green"
      ></sl-icon>
      <span slot="content" class="text-xs">${msg("Beta feature")}</span>
    </sl-tooltip>`;
  }
}

@customElement("btrix-beta-badge")
@localized()
export class BetaBadge extends TailwindElement {
  @property({ type: String })
  placement: SlTooltip["placement"] = "top";

  static styles = styles;

  render() {
    return html`<sl-tooltip hoist placement=${this.placement}>
      <div slot="content" class="text-xs">
        <slot name="content">
          <b>${msg("This part of Browsertrix is in beta!")}</b>
          <p>
            ${msg(
              "Parts might change or be broken. Please share your thoughts with us!",
            )}
          </p>
        </slot>
      </div>
      <span class="inline-block align-middle text-xs text-brand-green">
        <sl-icon
          name="flask-fill"
          library="app"
          label="Beta feature"
          class="size-4 align-middle"
        ></sl-icon
        >&nbsp;${msg("Beta")}
      </span>
    </sl-tooltip>`;
  }
}
