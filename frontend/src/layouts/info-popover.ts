import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Popover } from "@/components/ui/popover";

export function infoPopover({
  content,
  placement,
}: {
  content: string | TemplateResult;
  placement?: Popover["placement"];
}) {
  return html`<btrix-popover placement=${ifDefined(placement)} hoist>
    <sl-icon class="text-neutral-500" name="info-circle"></sl-icon>
    <div slot="content">${content}</div>
  </btrix-popover>`;
}
