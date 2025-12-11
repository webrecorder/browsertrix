import { html } from "lit";
import { styleMap } from "lit/directives/style-map.js";

export const renderLegendColor = (color: { primary: string; border: string }) =>
  html`<span
    class="relative mr-1 inline-block size-[1cap] rounded-sm border"
    style=${styleMap({
      backgroundColor: `var(--sl-color-${color.primary})`,
      borderColor: `var(--sl-color-${color.border})`,
    })}
  ></span>`;
