import type { Meta, StoryObj } from "@storybook/web-components";
import { addDays } from "date-fns/fp";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./Dashboard";
import {
  collections,
  metrics,
  metricsWithStorageQuota,
  metricsWithUsage,
  quotas,
  quotasWithExecutionMinutes,
  subscription,
} from "./data";

import { TRIAL_DAYS_LEFT_SHOW_WARNING } from "@/features/org/org-status-banner";
import {
  orgDecorator,
  type StorybookOrgProps,
} from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type APIPaginatedList } from "@/types/api";
import { SubscriptionStatus } from "@/types/billing";
import { type Collection } from "@/types/collection";
import { type Metrics } from "@/types/org";

const meta = {
  title: "Pages/Dashboard",
  component: "btrix-dashboard",
  tags: ["autodocs"],
  decorators: [
    userDecorator as DecoratorFunction,
    orgDecorator as DecoratorFunction,
  ],
  render: renderComponent,
  argTypes: {},
  args: {
    user: "crawler",
    auth: true,
    orgUsers: true,
  },
} satisfies Meta<RenderProps & StorybookUserProps & StorybookOrgProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const emptyCollectionsRequest = http.get(/\/collections/, async () => {
  await delay(500);
  return HttpResponse.json<APIPaginatedList<Collection>>(collections);
});

export const NoSubscriptionWithoutUsage: Story = {
  args: {
    orgQuotas: {
      ...quotas,
      ...quotasWithExecutionMinutes,
    },
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/metrics/, async () => {
          await delay(500);
          return HttpResponse.json<Metrics>({
            ...metrics,
            ...metricsWithStorageQuota,
          });
        }),
        emptyCollectionsRequest,
      ],
    },
  },
};

export const NoSubscriptionWithUsage: Story = {
  args: {
    orgQuotas: {
      ...quotas,
      ...quotasWithExecutionMinutes,
    },
    orgUsage: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/metrics/, async () => {
          await delay(500);
          return HttpResponse.json<Metrics>({
            ...metrics,
            ...metricsWithStorageQuota,
            ...metricsWithUsage,
          });
        }),
        emptyCollectionsRequest,
      ],
    },
  },
};

export const TrialWithoutUsage: Story = {
  args: {
    orgQuotas: {
      ...quotas,
      ...quotasWithExecutionMinutes,
    },
    orgSubscription: {
      ...subscription,
      status: SubscriptionStatus.Trialing,
    },
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/metrics/, async () => {
          await delay(500);
          return HttpResponse.json<Metrics>({
            ...metrics,
            ...metricsWithStorageQuota,
          });
        }),
        emptyCollectionsRequest,
      ],
    },
  },
};

export const TrialWithUsage: Story = {
  args: {
    orgQuotas: {
      ...quotas,
      ...quotasWithExecutionMinutes,
    },
    orgUsage: true,
    orgSubscription: {
      ...subscription,
      status: SubscriptionStatus.Trialing,
    },
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/metrics/, async () => {
          await delay(500);
          return HttpResponse.json<Metrics>({
            ...metrics,
            ...metricsWithStorageQuota,
            ...metricsWithUsage,
          });
        }),
        emptyCollectionsRequest,
      ],
    },
  },
};

export const TrialEndingWithoutUsage: Story = {
  args: {
    orgQuotas: {
      ...quotas,
      ...quotasWithExecutionMinutes,
    },
    orgUsage: true,
    orgSubscription: {
      ...subscription,
      status: SubscriptionStatus.Trialing,
      futureCancelDate: addDays(
        TRIAL_DAYS_LEFT_SHOW_WARNING,
        new Date(),
      ).toISOString(),
    },
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/metrics/, async () => {
          await delay(500);
          return HttpResponse.json<Metrics>({
            ...metrics,
            ...metricsWithStorageQuota,
            ...metricsWithUsage,
          });
        }),
        emptyCollectionsRequest,
      ],
    },
  },
};

export const TrialEndingWithUsage: Story = {
  args: {
    orgQuotas: {
      ...quotas,
      ...quotasWithExecutionMinutes,
    },
    orgUsage: true,
    orgSubscription: {
      ...subscription,
      status: SubscriptionStatus.Trialing,
      futureCancelDate: addDays(
        TRIAL_DAYS_LEFT_SHOW_WARNING,
        new Date(),
      ).toISOString(),
    },
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/metrics/, async () => {
          await delay(500);
          return HttpResponse.json<Metrics>({
            ...metrics,
            ...metricsWithStorageQuota,
            ...metricsWithUsage,
          });
        }),
        emptyCollectionsRequest,
      ],
    },
  },
};

export const ActiveSubscriptionWithoutUsage: Story = {
  args: {
    orgQuotas: {
      ...quotas,
      ...quotasWithExecutionMinutes,
    },
    orgSubscription: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/metrics/, async () => {
          await delay(500);
          return HttpResponse.json<Metrics>({
            ...metrics,
            ...metricsWithStorageQuota,
          });
        }),
        emptyCollectionsRequest,
      ],
    },
  },
};

export const ActiveSubscriptionWithUsage: Story = {
  args: {
    orgQuotas: {
      ...quotas,
      ...quotasWithExecutionMinutes,
    },
    orgSubscription: true,
    orgUsage: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(/\/metrics/, async () => {
          await delay(500);
          return HttpResponse.json<Metrics>({
            ...metrics,
            ...metricsWithStorageQuota,
            ...metricsWithUsage,
          });
        }),
        emptyCollectionsRequest,
      ],
    },
  },
};
