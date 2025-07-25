import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";
import type { DecoratorFunction } from "storybook/internal/types";

import { argTypes } from "../excludeContainerProperties";

import "@/features/crawl-workflows/workflow-action-menu";

import workflowMock from "@/__mocks__/api/orgs/[id]/crawlconfigs/[id]";
import type { WorkflowActionMenu } from "@/features/crawl-workflows/workflow-action-menu";
import { orgDecorator, orgMock } from "@/stories/decorators/orgDecorator";
import type { Workflow } from "@/types/crawler";
import { AccessCode } from "@/types/org";
import appState from "@/utils/state";

const mockAppState = ({ role }: { role: AccessCode }) => {
  return {
    ...appState,
    org: orgMock,
    isCrawler: role >= AccessCode.crawler,
    isAdmin: role >= AccessCode.owner,
    userOrg: {
      default: true,
      id: orgMock.id,
      name: orgMock.name,
      slug: orgMock.slug,
      role,
    },
    orgId: workflowMock.oid,
  };
};

const meta = {
  title: "Features/Workflow Action Menu",
  component: "btrix-workflow-action-menu",
  subcomponents: {
    CustomBehaviorsTableRow: "btrix-workflow-action-menu-row",
  },
  tags: ["autodocs"],
  decorators: [orgDecorator as DecoratorFunction],
  render: (args) => html`
    <btrix-workflow-action-menu
      .appState=${args.appState}
      .workflow=${args.workflow}
      .latestCrawl=${args.latestCrawl}
      .logTotals=${args.logTotals}
      ?hidePauseResume=${args.hidePauseResume}
      ?disablePauseResume=${args.disablePauseResume}
      ?cancelingRun=${args.cancelingRun}
    ></btrix-workflow-action-menu>
  `,
  argTypes: {
    ...argTypes,
  },
  args: {
    appState: mockAppState({ role: 20 }),
    workflow: workflowMock as unknown as Workflow,
  },
} satisfies Meta<WorkflowActionMenu>;

export default meta;
type Story = StoryObj<WorkflowActionMenu>;

/**
 * Users with a "crawler" role will see the following options.
 */
export const Crawler: Story = {
  args: {
    workflow: {
      ...meta.args.workflow,
    },
  },
};

/**
 * A workflow can be deleted if it's never been run.
 */
export const NoRuns: Story = {
  args: {
    workflow: {
      ...meta.args.workflow,
      crawlCount: 0,
    },
  },
};

/**
 * Additional actions are displayed depending on the workflow run state.
 */
export const Running: Story = {
  args: {
    workflow: {
      ...meta.args.workflow,
      isCrawlRunning: true,
      lastCrawlState: "running",
    },
  },
};

export const Paused: Story = {
  args: {
    workflow: {
      ...meta.args.workflow,
      isCrawlRunning: true,
      lastCrawlState: "paused",
    },
  },
};

export const Canceling: Story = {
  args: {
    workflow: {
      ...meta.args.workflow,
      isCrawlRunning: true,
      lastCrawlState: "running",
    },
    cancelingRun: true,
  },
};

/**
 * Users with a "viewer" role will only see copy-to-clipboard options.
 */
export const Viewer: Story = {
  args: {
    appState: mockAppState({ role: 10 }),
    workflow: {
      ...meta.args.workflow,
      tags: ["sample-tag-1", "sample-tag-2"],
    },
  },
};
