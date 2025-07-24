import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

const render = () => html`
  <sl-menu class="mx-auto max-w-xs">
    <sl-menu-item class="menu-item-success">
      <sl-icon name="play" slot="prefix"></sl-icon>
      Run Crawl
    </sl-menu-item>
    <sl-divider></sl-divider>
    <sl-menu-item>
      <sl-icon name="gear" slot="prefix"></sl-icon>
      Edit Workflow Settings
    </sl-menu-item>
    <sl-menu-item>
      <sl-icon name="files" slot="prefix"></sl-icon>
      Duplicate Workflow
    </sl-menu-item>
    <sl-divider></sl-divider>
    <sl-menu-item>
      <sl-icon name="tags" slot="prefix"></sl-icon>
      Copy Tags
    </sl-menu-item>
    <sl-menu-item>
      <sl-icon name="copy" slot="prefix"></sl-icon>
      Copy Workflow ID
    </sl-menu-item>
    <sl-divider></sl-divider>
    <sl-menu-item class="menu-item-danger">
      <sl-icon name="trash3" slot="prefix"></sl-icon>
      Delete Workflow
    </sl-menu-item>
  </sl-menu>
`;

const meta: Meta = {
  component: "sl-menu",
  tags: ["!dev"], // Hide from story navigation
  render,
};

export default meta;
type Story = StoryObj;

export const WorkflowActionMenu: Story = {};
