import type { StoryContext, StoryFn } from "@storybook/web-components";
import { html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { OrgUploadsContext } from "@/context/org-uploads";
import { orgUploadsInitialValue } from "@/context/org-uploads/org-uploads";
import { OrgUploadsContextController } from "@/context/org-uploads/OrgUploadsContextController";
import { orgUploadsContextKey } from "@/context/org-uploads/types";

export type StorybookOrgUploadsProps = {
  orgUploads?: OrgUploadsContext;
};

@customElement("btrix-storybook-org-uploads")
export class StorybookOrg extends BtrixElement {
  @property({ type: Object, attribute: false })
  orgUploads: OrgUploadsContext = orgUploadsInitialValue;

  private readonly [orgUploadsContextKey] = new OrgUploadsContextController(
    this,
  );

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("orgUploads")) {
      Object.entries(this.orgUploads).forEach(([uploadId, upload]) => {
        this[orgUploadsContextKey].setUpload(uploadId, upload);
      });
    }
  }

  render() {
    return html`<slot></slot>`;
  }
}

export function orgUploadsDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  const { orgUploads } = args as StorybookOrgUploadsProps;

  return html`<btrix-storybook-org-uploads .orgUploads=${orgUploads || {}}>
    ${story(args, context)}
  </btrix-storybook-org-uploads>`;
}
