import { localized, msg } from "@lit/localize";
import { type SlTooltip } from "@shoelace-style/shoelace";
import { html, unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";

import stylesheet from "./beta-badges.stylesheet.css";

import { TailwindElement } from "@/classes/TailwindElement";

const styles = unsafeCSS(stylesheet);

@localized()
@customElement("btrix-beta-icon")
export class BetaIcon extends TailwindElement {
  static styles = styles;
  render() {
    return html`<sl-tooltip content=${msg("Beta feature")} hoist>
      <sl-icon
        name="flask-fill"
        library="app"
        label="Beta"
        class="size-4 text-brand-green"
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
