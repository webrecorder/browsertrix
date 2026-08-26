import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";

import { asideHeading } from "../layouts/asideHeading";

import { onboardingSteps } from "@/utils/onboarding/onboardingEvents";
import appState from "@/utils/state";

function onboardingList(
  items: {
    content: TemplateResult | string;
    tooltip?: TemplateResult | string;
  }[],
) {
  return html`<ol
    class="grid grid-cols-[max-content_max-content_1fr] gap-x-1.5 gap-y-4 border-l"
  >
    ${items.map((item, i) => {
      const checked = appState.onboarding?.stepsComplete?.[i];
      const content = html`
        <sl-icon
          class="size-4 text-base text-primary"
          name=${checked ? "check-circle-fill" : `${i + 1}-circle`}
        ></sl-icon>
        <div>${item.content}</div>
      `;

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
          ${item.tooltip
            ? html`<btrix-popover placement="left-start" hoist>
                <div slot="content">${item.tooltip}</div>
                ${content}
              </btrix-popover>`
            : content}
        </li>
      `;
    })}
  </ol>`;
}

export function trialChecklist() {
  return html`
    <section>
      ${asideHeading(msg("Trial Checklist"))}

      <div class="text-xs leading-normal text-neutral-600">
        <p class="mb-2">
          ${msg("Optimize your trial with these recommended steps.")}
        </p>
      </div>

      <div
        class="mb-1 mt-4 cursor-default text-xs font-medium text-neutral-600"
      >
        ${onboardingList(
          onboardingSteps.map(({ label, description }) => ({
            content: label,
            tooltip: description,
          })),
        )}
      </div>
    </section>
  `;
}
