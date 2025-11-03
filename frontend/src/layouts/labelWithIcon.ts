import { html, type TemplateResult } from "lit";

export function labelWithIcon({
  label,
  icon,
}: {
  label?: string | TemplateResult;
  icon?: TemplateResult;
}) {
  return html`<div class="inline-flex h-6 items-center gap-2">
    ${icon}
    <div class="leading-none">${label}</div>
  </div>`;
}
