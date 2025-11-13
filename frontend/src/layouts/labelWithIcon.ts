import { html, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function labelWithIcon({
  label,
  icon,
  hideLabel,
}: {
  label?: string | TemplateResult;
  icon?: TemplateResult;
  hideLabel?: boolean;
}) {
  if (label && hideLabel) {
    return html`<div class="flex items-center">
      <sl-tooltip
        content=${label}
        @sl-hide=${(e: Event) => e.stopPropagation()}
        @sl-after-hide=${(e: Event) => e.stopPropagation()}
        hoist
      >
        <div>${icon}</div>
      </sl-tooltip>
    </div>`;
  }

  return html`<div
    class=${tw`flex h-6 items-center gap-2 text-neutral-700 [&>sl-icon]:text-base [&>sl-icon]:leading-none`}
  >
    ${icon}
    <div class="text-sm leading-none">
      ${label ?? html`<sl-skeleton class="w-12"></sl-skeleton>`}
    </div>
  </div>`;
}
