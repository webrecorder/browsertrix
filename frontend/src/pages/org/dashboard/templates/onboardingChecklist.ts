import { html, type TemplateResult } from "lit";

import { type OnboardingStep } from "@/utils/onboarding/onboardingEvents";
import appState from "@/utils/state";

export function onboardingChecklist(
  items: {
    key: OnboardingStep;
    content: TemplateResult | string;
    tooltip: TemplateResult | string;
  }[],
) {
  return html`<ol
    class="grid grid-cols-[repeat(3,max-content)] gap-x-1.5 gap-y-3.5 border-l"
  >
    ${items.map((item, i) => {
      const checked = appState.onboarding?.stepsComplete?.[item.key];

      return html`
        <li class="col-span-full -ml-px grid grid-cols-subgrid items-center">
          ${i === 0
            ? html`<div class="flex h-full w-2 flex-col">
                <div class="flex-1 bg-white"></div>
                <div class="flex h-4 w-full items-end bg-white">
                  <div class="size-2 rounded-tl-md border-l border-t"></div>
                </div>
                <div class="flex-1"></div>
              </div>`
            : i === items.length - 1
              ? html`<div class="flex h-full w-2 flex-col">
                  <div class="flex-1"></div>
                  <div class="flex h-4 w-full items-start bg-white">
                    <div class="size-2 rounded-bl-md border-b border-l"></div>
                  </div>
                  <div class="flex-1 bg-white"></div>
                </div>`
              : html`<div class="w-2 border-t"></div>`}
          <btrix-popover placement="left-start" hoist>
            <div slot="content">${item.tooltip}</div>
            <button class="inline-flex cursor-default items-center gap-1.5">
              <sl-icon
                class="size-4 text-base text-primary"
                name=${checked ? "check-circle-fill" : `${i + 1}-circle`}
              ></sl-icon>
              <span class="font-medium text-neutral-600">${item.content}</span>
            </button>
          </btrix-popover>
        </li>
      `;
    })}
  </ol>`;
}
