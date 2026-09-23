import type {
  Meta,
  StoryContext,
  StoryFn,
  StoryObj,
} from "@storybook/web-components";
import { html } from "lit";
import { delay, http, HttpResponse } from "msw";
import { type DecoratorFunction } from "storybook/internal/types";

import { renderComponent, type RenderProps } from "./SelectBrowserProfile";

import profilesMock from "@/__mocks__/api/orgs/[id]/profiles.js";
import {
  orgDecorator,
  type StorybookOrgProps,
} from "@/stories/decorators/orgDecorator";
import {
  userDecorator,
  type StorybookUserProps,
} from "@/stories/decorators/userDecorator";
import { type APIPaginatedList } from "@/types/api";
import { type Profile } from "@/types/crawler";
import { type SearchValues } from "@/utils/searchValues";

const profiles = profilesMock as APIPaginatedList<Profile>;

function wrapperDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;

  return html`<div class="max-w-sm">${story(args, context)}</div>`;
}

const meta = {
  title: "Features/Browser Profiles/Select Browser Profile",
  component: "btrix-select-browser-profile",
  tags: ["autodocs"],
  decorators: [
    userDecorator as DecoratorFunction,
    orgDecorator as DecoratorFunction,
    wrapperDecorator as DecoratorFunction,
  ],
  render: renderComponent,
  argTypes: {},
  args: {
    user: true,
    auth: true,
  },
} satisfies Meta<RenderProps & StorybookUserProps & StorybookOrgProps>;

export default meta;
type Story = StoryObj<RenderProps>;

const getProfiles = (data = profiles) =>
  http.get(/\/profiles$/, async ({ request }) => {
    await delay(500);

    const url = new URL(request.url);
    const params = url.searchParams;
    const pageSize = params.get("pageSize")
      ? +params.get("pageSize")!
      : data.pageSize;

    const resp = { ...data };

    resp.pageSize = pageSize;
    resp.items = data.items.slice(0, pageSize);

    return HttpResponse.json<APIPaginatedList<Profile>>(resp);
  });

const getSearchValues = (data = profiles) =>
  http.get(/\/profiles\/search-values/, async () => {
    await delay(500);
    return HttpResponse.json<SearchValues>({
      names: data.items.map(({ name }) => name),
    });
  });

export const WithoutProfiles: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [
        getProfiles({
          total: 0,
          items: [],
          page: 1,
          pageSize: 1000,
        }),
        getSearchValues({
          total: 0,
          items: [],
          page: 1,
          pageSize: 1000,
        }),
      ],
    },
  },
};

export const WithoutProfilesAllowNew: Story = {
  args: {
    allowNew: true,
  },
  parameters: {
    msw: {
      handlers: [
        getProfiles({
          total: 0,
          items: [],
          page: 1,
          pageSize: 1000,
        }),
        getSearchValues({
          total: 0,
          items: [],
          page: 1,
          pageSize: 1000,
        }),
      ],
    },
  },
};

export const WithProfiles: Story = {
  args: {},
  parameters: {
    msw: {
      handlers: [getProfiles(), getSearchValues()],
    },
  },
};

export const WithProfilesAllowNew: Story = {
  args: {
    allowNew: true,
  },
  parameters: {
    msw: {
      handlers: [getProfiles(), getSearchValues()],
    },
  },
};

export const WithValue: Story = {
  args: {
    profileId: "fake-0273-4131-99eb-a4c780818ed2",
  },
  parameters: {
    msw: {
      handlers: [getProfiles(), getSearchValues()],
    },
  },
};

export const SuggestedOrigins: Story = {
  args: {
    suggestOrigins: ["instagram.com"],
  },
  parameters: {
    msw: {
      handlers: [getProfiles(), getSearchValues()],
    },
  },
};
