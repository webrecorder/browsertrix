import { html } from "lit";

import "@/features/collections";
import "@/features/meters";
import "@/pages/org/dashboard";

import type { Dashboard } from "@/pages/org/dashboard";
import { type StorybookOrgProps } from "@/stories/decorators/orgDecorator";
import { type StorybookUserProps } from "@/stories/decorators/userDecorator";

export type RenderProps = Dashboard & StorybookUserProps & StorybookOrgProps;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-dashboard
    ?showOnboardingFinishedDialog=${props.showOnboardingFinishedDialog}
  ></btrix-dashboard>`;
};
