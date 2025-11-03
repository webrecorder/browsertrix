import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { argTypes } from "../excludeContainerProperties";

import "@/features/archived-items/crawl-status";

import type { CrawlStatus } from "@/features/archived-items/crawl-status";
import { CRAWL_STATES } from "@/types/crawlState";

const meta = {
  title: "Features/Crawl Status",
  component: "btrix-crawl-status",
  tags: ["autodocs"],
  render: (args) => html`
    <btrix-crawl-status
      .state=${args.state}
      .type=${args.type}
      ?hideLabel=${args.hideLabel}
      ?stopping=${args.stopping}
      ?shouldPause=${args.shouldPause}
      ?hoist=${args.hoist}
    ></btrix-crawl-status>
  `,
  argTypes: {
    ...argTypes,
  },
  args: {},
} satisfies Meta<CrawlStatus>;

export default meta;
type Story = StoryObj<CrawlStatus>;

export const AllStates: Story = {
  decorators: [
    () => html`
      <btrix-table
        class="w-full [--btrix-table-cell-padding:var(--sl-spacing-x-small)]"
      >
        <btrix-table-head>
          <btrix-table-header-cell>Status UI</btrix-table-header-cell>
          <btrix-table-header-cell>State</btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body>
          ${CRAWL_STATES.map(
            (state) =>
              html`<btrix-table-row class="border-t">
                <btrix-table-cell>
                  <btrix-crawl-status state=${state}></btrix-crawl-status>
                </btrix-table-cell>
                <btrix-table-cell><code>${state}</code></btrix-table-cell>
              </btrix-table-row>`,
          )}
          <btrix-table-row class="border-t">
            <btrix-table-cell>
              <btrix-crawl-status></btrix-crawl-status>
            </btrix-table-cell>
            <btrix-table-cell><em>Empty</em></btrix-table-cell>
          </btrix-table-row>
        </btrix-table-body>
      </btrix-table>
    `,
  ],
};
