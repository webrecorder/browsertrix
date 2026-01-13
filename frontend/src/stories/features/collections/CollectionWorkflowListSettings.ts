import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { CollectionWorkflowListSettings } from "@/features/collections/collection-workflow-list/settings";

import "@/features/collections/collection-workflow-list/settings";

export type RenderProps = CollectionWorkflowListSettings;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-collection-workflow-list-settings
    workflowId=${ifDefined(props.workflowId)}
    collectionId=${ifDefined(props.collectionId)}
    dedupeCollId=${ifDefined(props.dedupeCollId)}
    .autoAddCollections=${props.autoAddCollections || []}
  ></btrix-collection-workflow-list-settings>`;
};
