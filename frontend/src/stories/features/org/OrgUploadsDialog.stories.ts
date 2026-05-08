import type {
  Meta,
  StoryContext,
  StoryFn,
  StoryObj,
} from "@storybook/web-components";
import { html } from "lit";
import type { DecoratorFunction } from "storybook/internal/types";

import { argTypes } from "../excludeContainerProperties";

import type { OrgUploadsDialog } from "@/features/org/org-uploads-dialog";
import {
  notificationsDecorator,
  type StorybookNotificationsProps,
} from "@/stories/decorators/notificationsDecorator";
import {
  orgDecorator,
  type StorybookOrgProps,
} from "@/stories/decorators/orgDecorator";
import {
  orgUploadsDecorator,
  type StorybookOrgUploadsProps,
} from "@/stories/decorators/orgUploadsDecorator";
import { BYTES_PER_GB, BYTES_PER_MB } from "@/utils/bytes";

import "@/features/org/org-uploads-dialog";

type RenderProps = OrgUploadsDialog &
  StorybookOrgProps &
  StorybookOrgUploadsProps &
  StorybookNotificationsProps;

function containerDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;
  return html`<div class="h-[16rem]">${story(args, context)}</div>`;
}

const meta = {
  title: "Features/Org/Org Uploads Dialog",
  component: "btrix-org-uploads-dialog",
  tags: ["autodocs"],
  decorators: [
    notificationsDecorator as DecoratorFunction,
    orgDecorator as DecoratorFunction,
    orgUploadsDecorator as DecoratorFunction,
    containerDecorator as DecoratorFunction,
  ],
  render: () => html`<btrix-org-uploads-dialog></btrix-org-uploads-dialog>`,
  argTypes: {
    ...argTypes,
  },
  args: {},
} satisfies Meta<RenderProps>;

export default meta;
type Story = StoryObj<RenderProps>;

export const WithUploadInProgress: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 9.005 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
      },
    },
  },
};

export const Minimized: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 9.005 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
      },
    },
  },
  render: () =>
    html`<btrix-org-uploads-dialog
      .minimized=${true}
    ></btrix-org-uploads-dialog>`,
};

export const Finishing: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 50.15 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
      },
    },
  },
};

export const Complete: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 50.15 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
        itemId: "upload-item-id-1-item-id",
      },
    },
  },
};

export const Canceled: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 9.005 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
        canceled: true,
      },
    },
  },
};

export const MultipleInProgress: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 9.005 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
      },
      "upload-2": {
        itemName:
          "Test WACZ file with longer file name for testing long file name",
        filename:
          "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
        loaded: 310 * BYTES_PER_MB,
        total: 4.85 * BYTES_PER_GB,
      },
    },
  },
};

export const SomeFinishing: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 50.15 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
      },
      "upload-2": {
        itemName:
          "Test WACZ file with longer file name for testing long file name",
        filename:
          "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
        loaded: 310 * BYTES_PER_MB,
        total: 4.85 * BYTES_PER_GB,
      },
    },
  },
};

export const SomeComplete: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 50.15 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
        itemId: "upload-item-id-1",
      },
      "upload-2": {
        itemName:
          "Test WACZ file with longer file name for testing long file name",
        filename:
          "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
        loaded: 310 * BYTES_PER_MB,
        total: 4.85 * BYTES_PER_GB,
      },
    },
  },
};

export const SomeCanceled: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 50.15 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
        canceled: true,
      },
      "upload-2": {
        itemName:
          "Test WACZ file with longer file name for testing long file name",
        filename:
          "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
        loaded: 310 * BYTES_PER_MB,
        total: 4.85 * BYTES_PER_GB,
      },
    },
  },
};

export const MultipleComplete: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 50.15 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
        itemId: "upload-item-id-1",
      },
      "upload-2": {
        itemName:
          "Test WACZ file with longer file name for testing long file name",
        filename:
          "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
        loaded: 310 * BYTES_PER_MB,
        total: 4.85 * BYTES_PER_GB,
        itemId: "upload-item-id-2",
      },
    },
  },
};

export const MixedStates: Story = {
  args: {
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 50.15 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
        canceled: true,
      },
      "upload-2": {
        itemName:
          "Test WACZ file with longer file name for testing long file name",
        filename:
          "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
        loaded: 4.85 * BYTES_PER_MB,
        total: 4.85 * BYTES_PER_GB,
        itemId: "upload-item-id-2",
      },
      "upload-3": {
        itemName: "Test WACZ file 2",
        filename: "test_file_2.wacz",
        loaded: 4.3 * BYTES_PER_MB,
        total: 4.3 * BYTES_PER_MB,
      },
    },
  },
};

export const WithToastStack: Story = {
  args: {
    notifications: [
      {
        id: "notification-1",
        type: "toast",
        message: "Success!",
        variant: "success",
        closable: true,
        duration: Infinity,
      },
    ],
    orgUploads: {
      "upload-1": {
        itemName: "Test WACZ File",
        filename: "test_file.wacz",
        loaded: 9.005 * BYTES_PER_MB,
        total: 50.15 * BYTES_PER_MB,
      },
      "upload-2": {
        itemName:
          "Test WACZ file with longer file name for testing long file name",
        filename:
          "test_file_with_longer_file_name_for_testing_long_file_name.wacz",
        loaded: 4.85 * BYTES_PER_MB,
        total: 4.85 * BYTES_PER_GB,
        itemId: "upload-item-id-2",
      },
    },
  },
};
