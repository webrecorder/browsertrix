import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { UrlList } from "@/features/crawls/url-list";

import "@/features/crawls/url-list";

export type RenderProps = UrlList & { classes?: string };

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-url-list
    class=${ifDefined(props.classes)}
    .urls=${props.urls || []}
    offset=${ifDefined(props.offset)}
    ?highlight=${props.highlight}
    ?border=${props.border}
    ?ordered=${props.ordered}
    .includeUrl=${props.includeUrl}
    .excludeUrl=${props.excludeUrl}
  ></btrix-url-list>`;
};
