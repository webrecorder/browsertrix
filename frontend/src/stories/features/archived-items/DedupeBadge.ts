import { html } from "lit";

import type { DedupeBadge } from "@/features/collections/dedupe-badge";

import "@/features/collections/dedupe-badge";

export type RenderProps = DedupeBadge;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-dedupe-badge
    .dependents=${props.dependents}
    .dependencies=${props.dependencies}
  ></btrix-dedupe-badge>`;
};
