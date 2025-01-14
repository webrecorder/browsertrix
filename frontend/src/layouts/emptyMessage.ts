import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function emptyMessage({
  message,
  detail,
  actions,
}: {
  message: TemplateResult | string;
  detail?: TemplateResult | string;
  actions?: TemplateResult;
}) {
  return html`
    <div class="flex flex-col items-center gap-4 border-y py-10">
      <p
        class=${clsx(
          tw`max-w-prose text-pretty`,
          detail
            ? tw`text-base font-medium leading-tight text-neutral-800`
            : tw`text-neutral-600`,
        )}
      >
        ${message}
      </p>
      ${detail
        ? html`<p
            class="max-w-prose text-pretty leading-relaxed text-neutral-600"
          >
            ${detail}
          </p>`
        : nothing}
      ${actions}
    </div>
  `;
}
