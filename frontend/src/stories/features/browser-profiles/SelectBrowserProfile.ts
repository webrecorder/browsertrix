import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { SelectBrowserProfile } from "@/features/browser-profiles/select-browser-profile";

import "@/features/crawls";
import "@/features/browser-profiles";

export type RenderProps = SelectBrowserProfile;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-select-browser-profile
    profileId=${ifDefined(props.profileId)}
    profileName=${ifDefined(props.profileName)}
    defaultProxyId=${ifDefined(props.defaultProxyId)}
    defaultCrawlerChannel=${ifDefined(props.defaultCrawlerChannel)}
    .suggestOrigins=${props.suggestOrigins}
    ?allowNew=${props.allowNew}
  ></btrix-select-browser-profile>`;
};
