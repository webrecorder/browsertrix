import type { Meta, StoryObj } from "@storybook/web-components";
import { html } from "lit";

import { argTypes } from "../excludeContainerProperties";

import type { CrawlLogTable } from "@/features/archived-items/crawl-log-table";
import { CrawlLogContext, CrawlLogLevel } from "@/types/crawler";

import "@/features/archived-items/crawl-log-table";

const meta = {
  title: "Features/Crawl Log Table",
  component: "btrix-crawl-log-table",
  tags: ["autodocs"],
  decorators: [
    (story) => html` <div class="w-full max-w-[58rem]">${story()}</div> `,
  ],
  render: (args) => html`
    <btrix-crawl-log-table
      .logs=${args.logs}
      .offset=${args.offset || 0}
    ></btrix-crawl-log-table>
  `,
  argTypes: {
    ...argTypes,
  },
  args: {
    logs: [
      {
        timestamp: new Date().toISOString(),
        logLevel: CrawlLogLevel.Info,
        details: {
          page: "https://webrecorder.net/blog/2025-04-16-our-new-resources-page-for-web-archivists/",
        },
        context: CrawlLogContext.General,
        message: "Sample info log",
      },
      {
        timestamp: new Date().toISOString(),
        logLevel: CrawlLogLevel.Warning,
        details: {
          page: "https://webrecorder.net/blog/2025-04-30-our-commitment-to-provide-accessible-tools/",
        },
        context: CrawlLogContext.General,
        message: "Sample warning log",
      },
      {
        timestamp: new Date().toISOString(),
        logLevel: CrawlLogLevel.Error,
        details: {
          page: "https://example.com",
        },
        context: CrawlLogContext.General,
        message: "Sample error log",
      },
      {
        timestamp: new Date().toISOString(),
        logLevel: CrawlLogLevel.Debug,
        details: {
          page: "https://example.com",
        },
        context: CrawlLogContext.General,
        message: "Sample debug log",
      },
      {
        timestamp: new Date().toISOString(),
        logLevel: CrawlLogLevel.Fatal,
        details: {
          page: "https://example.com",
        },
        context: CrawlLogContext.General,
        message: "Sample fatal log",
      },
      {
        timestamp: new Date().toISOString(),
        logLevel: CrawlLogLevel.Info,
        details: {
          page: "https://webrecorder.net",
        },
        context: CrawlLogContext.Behavior,
        message: "Sample behavior log",
      },
      {
        timestamp: new Date().toISOString(),
        logLevel: CrawlLogLevel.Info,
        details: {
          page: "https://webrecorder.net",
        },
        context: CrawlLogContext.BehaviorScript,
        message: "Sample behavior script log",
      },
      {
        timestamp: new Date().toISOString(),
        logLevel: CrawlLogLevel.Info,
        details: {
          page: "https://webrecorder.net",
        },
        context: CrawlLogContext.BehaviorScript,
        message: "Sample custom behavior script log",
      },
    ],
  },
} satisfies Meta<CrawlLogTable>;

export default meta;
type Story = StoryObj<CrawlLogTable>;

export const WithLogs: Story = {
  args: {},
};

export const Empty: Story = {
  args: {
    logs: [],
  },
};

export const LargeDataSet: Story = {
  args: {
    logs: Array.from({ length: 100 }).map((_, i) => ({
      timestamp: new Date().toISOString(),
      logLevel: CrawlLogLevel.Info,
      details: {
        page: "https://example.com",
      },
      context: "unknown",
      message: `Log ${i + 1}`,
    })),
  },
};
