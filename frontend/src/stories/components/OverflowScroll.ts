import clsx from "clsx";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { defaultArgs, renderTable } from "./Table";

import "@/components/ui/overflow-scroll";

import type { OverflowScroll } from "@/components/ui/overflow-scroll";
import { tw } from "@/utils/tailwind";

export type RenderProps = OverflowScroll;

export const renderOverflowScroll = ({
  direction,
  scrim,
}: Partial<RenderProps>) => {
  return html`
    <div
      class="w-[400px] min-w-16 max-w-[818px] resize-x overflow-hidden rounded rounded-lg rounded-br-none border p-2"
    >
      <btrix-overflow-scroll
        direction=${ifDefined(direction)}
        ?scrim=${ifDefined(scrim)}
      >
        <!-- Table just as a demo of where this might be used -->
        ${renderTable({
          ...defaultArgs,
          classes: clsx(
            ...defaultArgs.classes,
            tw`w-[800px] rounded border bg-neutral-50 p-2 [--btrix-table-cell-padding:var(--sl-spacing-2x-small)]`,
          ),
        })}
      </btrix-overflow-scroll>
    </div>
  `;
};
