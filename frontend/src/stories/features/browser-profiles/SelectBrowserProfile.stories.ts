import type { Meta, StoryObj } from "@storybook/web-components";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./SelectBrowserProfile";

import {
  orgDecorator,
  type StorybookOrgProps,
} from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";

const meta = {
  title: "Features/Browser Profiles/Select Browser Profile",
  component: "btrix-select-browser-profile",
  tags: ["autodocs"],
  decorators: [
    userDecorator as DecoratorFunction,
    orgDecorator as DecoratorFunction,
  ],
  render: renderComponent,
  argTypes: {},
  args: {
    user: true,
    auth: true,
  },
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps & StorybookUserProps & StorybookOrgProps>;

export const Empty: Story = {
  args: {},
};
