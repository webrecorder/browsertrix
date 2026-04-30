import type {
  Meta,
  StoryContext,
  StoryFn,
  StoryObj,
} from "@storybook/web-components";
import { html } from "lit";
import type { DecoratorFunction } from "storybook/internal/types";

import { argTypes } from "../excludeContainerProperties";

import type { OrgUploadsOverlay } from "@/features/org/org-uploads-overlay";
import {
  orgDecorator,
  type StorybookOrgProps,
} from "@/stories/decorators/orgDecorator";
import { BYTES_PER_GB, BYTES_PER_MB } from "@/utils/bytes";

import "@/features/org/org-uploads-overlay";

type RenderProps = OrgUploadsOverlay & StorybookOrgProps;

function containerDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  return html`<div class="h-[16rem]">${story(args, context)}</div>`;
}

const meta = {
  title: "Features/Org/Org Uploads Overlay",
  component: "btrix-org-uploads-overlay",
  tags: ["autodocs"],
  decorators: [
    orgDecorator as DecoratorFunction,
    containerDecorator as DecoratorFunction,
  ],
  render: () => html` <btrix-org-uploads-overlay></btrix-org-uploads-overlay> `,
  argTypes: {
    ...argTypes,
  },
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const WithUploadInProgress: Story = {
  render: () => html`
    <btrix-org-uploads-overlay
      .orgUploads=${{
        "upload-id-1": {
          itemName: "Test WACZ File",
          filename: "test_file.wacz",
          loaded: 9.005 * BYTES_PER_MB,
          total: 50.15 * BYTES_PER_MB,
        },
      } satisfies OrgUploadsOverlay["orgUploads"]}
    ></btrix-org-uploads-overlay>
  `,
};

export const Minimized: Story = {
  render: () => html`
    <btrix-org-uploads-overlay
      .minimized=${true}
      .orgUploads=${{
        "upload-id-1": {
          itemName: "Test WACZ File",
          filename: "test_file.wacz",
          loaded: 9.005 * BYTES_PER_MB,
          total: 50.15 * BYTES_PER_MB,
        },
      } satisfies OrgUploadsOverlay["orgUploads"]}
    ></btrix-org-uploads-overlay>
  `,
};

export const MultipleUploadsInProgress: Story = {
  render: () => html`
    <btrix-org-uploads-overlay
      .orgUploads=${{
        "upload-id-1": {
          itemName: "Test WACZ File",
          filename: "test_file.wacz",
          loaded: 9.005 * BYTES_PER_MB,
          total: 50.15 * BYTES_PER_MB,
        },
        "upload-id-2": {
          itemName:
            "Test WACZ file with longer file name for testing long file name",
          filename:
            "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
          loaded: 310 * BYTES_PER_MB,
          total: 4.85 * BYTES_PER_GB,
        },
      } satisfies OrgUploadsOverlay["orgUploads"]}
    ></btrix-org-uploads-overlay>
  `,
};

export const SomeInProgress: Story = {
  render: () => html`
    <btrix-org-uploads-overlay
      .orgUploads=${{
        "upload-id-1": {
          itemName: "Test WACZ File",
          filename: "test_file.wacz",
          loaded: 9.005 * BYTES_PER_MB,
          total: 50.15 * BYTES_PER_MB,
        },
        "upload-id-2": {
          itemId: window.crypto.randomUUID(),
          itemName:
            "Test WACZ file with longer file name for testing long file name",
          filename:
            "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
          loaded: 4.85 * BYTES_PER_GB,
          total: 4.85 * BYTES_PER_GB,
        },
      } satisfies OrgUploadsOverlay["orgUploads"]}
    ></btrix-org-uploads-overlay>
  `,
};

export const AllDone: Story = {
  render: () => html`
    <btrix-org-uploads-overlay
      .orgUploads=${{
        "upload-id-1": {
          itemId: window.crypto.randomUUID(),
          itemName: "Test WACZ File",
          filename: "test_file.wacz",
          loaded: 50.15 * BYTES_PER_MB,
          total: 50.15 * BYTES_PER_MB,
        },
        "upload-id-2": {
          itemId: window.crypto.randomUUID(),
          itemName:
            "Test WACZ file with longer file name for testing long file name",
          filename:
            "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
          loaded: 4.85 * BYTES_PER_GB,
          total: 4.85 * BYTES_PER_GB,
        },
      } satisfies OrgUploadsOverlay["orgUploads"]}
    ></btrix-org-uploads-overlay>
  `,
};

export const Cancel: Story = {
  render: () => html`
    <btrix-org-uploads-overlay
      .canceling=${"upload-id-1" satisfies OrgUploadsOverlay["canceling"]}
      .orgUploads=${{
        "upload-id-1": {
          itemName: "Test WACZ File",
          filename: "test_file.wacz",
          loaded: 9.005 * BYTES_PER_MB,
          total: 50.15 * BYTES_PER_MB,
        },
        "upload-id-2": {
          itemId: window.crypto.randomUUID(),
          itemName:
            "Test WACZ file with longer file name for testing long file name",
          filename:
            "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
          loaded: 4.85 * BYTES_PER_GB,
          total: 4.85 * BYTES_PER_GB,
        },
      } satisfies OrgUploadsOverlay["orgUploads"]}
    ></btrix-org-uploads-overlay>
  `,
};

export const WithCanceled: Story = {
  render: () => html`
    <btrix-org-uploads-overlay
      .orgUploads=${{
        "upload-id-1": {
          itemName: "Test WACZ File",
          filename: "test_file.wacz",
          loaded: 9.005 * BYTES_PER_MB,
          total: 50.15 * BYTES_PER_MB,
          canceled: true,
        },
        "upload-id-2": {
          itemId: window.crypto.randomUUID(),
          itemName:
            "Test WACZ file with longer file name for testing long file name",
          filename:
            "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
          loaded: 4.85 * BYTES_PER_GB,
          total: 4.85 * BYTES_PER_GB,
        },
      } satisfies OrgUploadsOverlay["orgUploads"]}
    ></btrix-org-uploads-overlay>
  `,
};

export const WithToastStack: Story = {
  render: () => html`
    <div
      class="btrix-toast-stack"
      style="--btrix-toast-stack-offset: calc(${(1 + 2) * 2.625}rem + 2.75rem)"
    >
      <sl-alert open>Example toast</sl-alert>
    </div>
    <btrix-org-uploads-overlay
      .orgUploads=${{
        "upload-id-1": {
          itemName: "Test WACZ File",
          filename: "test_file.wacz",
          loaded: 9.005 * BYTES_PER_MB,
          total: 50.15 * BYTES_PER_MB,
        },
        "upload-id-2": {
          itemId: window.crypto.randomUUID(),
          itemName:
            "Test WACZ file with longer file name for testing long file name",
          filename:
            "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
          loaded: 4.85 * BYTES_PER_GB,
          total: 4.85 * BYTES_PER_GB,
        },
      } satisfies OrgUploadsOverlay["orgUploads"]}
    ></btrix-org-uploads-overlay>
  `,
};
