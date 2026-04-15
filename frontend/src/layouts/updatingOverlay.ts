import { msg } from "@lit/localize";
import clsx from "clsx";
import { html, type nothing, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function updatingOverlay(props?: {
  message?: string | TemplateResult | null | undefined | typeof nothing;
  class?: string;
}) {
  return html`
    <div
      class=${clsx(
        tw`backdrop-blur-px bg-radial absolute inset-0 grid place-items-center from-white/90 to-white/10`,
        props?.class,
      )}
    >
      <span class="flex items-center gap-2">
        <sl-spinner></sl-spinner> ${props?.message ?? msg("Updating...")}
      </span>
    </div>
  `;
}
