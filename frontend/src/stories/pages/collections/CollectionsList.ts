import { html } from "lit";

import type { CollectionsList } from "@/pages/org/collections-list";

// FIXME Importing thumbanils don't work due to AVIF
// May be worth doing later with a custom loader
// https://github.com/storybookjs/storybook/discussions/30336
// import "@/features/collections";
import "@/pages/org/collections-list";

export type RenderProps = CollectionsList;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-collections-list
    ?isCrawler=${props.isCrawler}
  ></btrix-collections-list>`;
};
