import type { Meta, StoryObj } from "@storybook/web-components";
import type { DecoratorFunction } from "storybook/internal/types";

import {
  renderComponent,
  type RenderProps,
} from "./CollectionWorkflowListSettings";
import { data } from "./data";

import { orgDecorator } from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";

const meta = {
  title: "Features/Collections/Collection Workflow List Settings",
  component: "btrix-dedupe-workflows",
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
} satisfies Meta<RenderProps & StorybookUserProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const workflowWithAutoAdd = data.workflows.find(
  ({ autoAddCollections }) => autoAddCollections.length,
)!;

export const WithoutAutoAdd: Story = {
  args: {
    workflowId: workflowWithAutoAdd.id,
  },
};

export const WithAutoAdd: Story = {
  args: {
    workflowId: workflowWithAutoAdd.id,
    autoAddCollections: workflowWithAutoAdd.autoAddCollections,
    collectionId: workflowWithAutoAdd.autoAddCollections[0],
  },
};

export const WithDedupe: Story = {
  args: {
    workflowId: workflowWithAutoAdd.id,
    autoAddCollections: workflowWithAutoAdd.autoAddCollections,
    collectionId: workflowWithAutoAdd.autoAddCollections[0],
    dedupeCollId: workflowWithAutoAdd.autoAddCollections[0],
  },
};

export const DedupeAnotherCollection: Story = {
  args: {
    workflowId: workflowWithAutoAdd.id,
    autoAddCollections: workflowWithAutoAdd.autoAddCollections,
    collectionId: workflowWithAutoAdd.autoAddCollections[0],
    dedupeCollId: "storybook-dedupe-another-collection-id",
  },
};

export const Collapsed: Story = {
  args: {
    workflowId: workflowWithAutoAdd.id,
    autoAddCollections: workflowWithAutoAdd.autoAddCollections,
    collectionId: workflowWithAutoAdd.autoAddCollections[0],
    dedupeCollId: "storybook-dedupe-another-collection-id",
    collapse: true,
  },
};
