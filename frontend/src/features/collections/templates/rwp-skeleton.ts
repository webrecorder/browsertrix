import { html } from "lit";

export function rwpSkeleton() {
  return html`<div
    class="pointer-events-none flex h-[--btrix-rwp-height] flex-col gap-3"
  >
    <div class="h-[3.625rem] rounded-lg border bg-neutral-50"></div>
    <div class="flex-1 rounded-lg border"></div>
  </div>`;
}
