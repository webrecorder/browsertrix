import type { Meta, StoryObj } from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./OrgActiveCrawlsStatus";

import { orgDecorator } from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type RunningWorkflowCounts } from "@/types/workflow";

const meta = {
  title: "Features/Org/Org Active Crawls Status",
  component: "btrix-org-active-crawls-status",
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

const runningWorkflowCounts = {
  totalRunningPausedWaiting: 0,
  totalRunning: 0,
  totalPaused: 0,
  totalWaiting: 0,
  running: 0,
  pendingWait: 0,
  generateWACZ: 0,
  uploadingWACZ: 0,
  rateLimited: 0,
  paused: 0,
  pausedStorageQuotaReached: 0,
  pausedTimeQuotaReached: 0,
  pausedOrgReadOnly: 0,
  pausedRateLimitTimeReached: 0,
  starting: 0,
  waitingCapacity: 0,
  waitingOrgLimit: 0,
  waitingDedupeIndex: 0,
} satisfies RunningWorkflowCounts;

export const Active: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/crawlconfigs\/running/, async () => {
          await delay(500);

          const data = {
            ...runningWorkflowCounts,
            totalRunningPausedWaiting: 5,
            totalRunning: 2,
            totalWaiting: 1,
            totalPaused: 2,
            running: 2,
            paused: 1,
            pausedRateLimitTimeReached: 1,
            starting: 1,
          } satisfies RunningWorkflowCounts;
          return HttpResponse.json<RunningWorkflowCounts>(data);
        }),
      ],
    },
  },
};

export const ServerError: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/crawlconfigs\/running/, async () => {
          await delay(500);
          return HttpResponse.json(
            { message: "Storybook error test" },
            { status: 500 },
          );
        }),
      ],
    },
  },
};

let polls = 0;
export const ServerErrorAfterRunning: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/crawlconfigs\/running/, async () => {
          await delay(500);

          const data = {
            ...runningWorkflowCounts,
            totalRunningPausedWaiting: 5,
            totalRunning: 2,
            totalWaiting: 1,
            totalPaused: 2,
            running: 2,
            paused: 1,
            pausedRateLimitTimeReached: 1,
            starting: 1,
          } satisfies RunningWorkflowCounts;

          if (polls < 1) {
            polls = polls + 1;
            return HttpResponse.json<RunningWorkflowCounts>(data);
          }
          return HttpResponse.error();
        }),
      ],
    },
  },
};

export const NoActiveCrawls: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        http.get(/\/crawlconfigs\/running/, async () => {
          await delay(500);
          return HttpResponse.json<RunningWorkflowCounts>(
            runningWorkflowCounts,
          );
        }),
      ],
    },
  },
};
