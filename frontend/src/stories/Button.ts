import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Button as BtrixButton } from "@/components/ui/button";

import "@/components/ui/button";

export interface ButtonProps extends BtrixButton {
  label?: string;
}

/** Primary UI component for user interaction */
export const Button = ({
  variant,
  filled,
  label,
  raised,
  loading,
  href,
}: ButtonProps) => {
  return html`
    <btrix-button
      variant=${ifDefined(variant)}
      label=${ifDefined(label)}
      href=${ifDefined(href)}
      ?filled=${filled}
      ?raised=${raised}
      ?loading=${loading}
    >
      ${label}
    </btrix-button>
  `;
};
