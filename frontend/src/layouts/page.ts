import { html, nothing, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { pageHeader, pageNav } from "./pageHeader";

import { tw } from "@/utils/tailwind";

export function pageHeading({
  content,
  level = 2,
}: {
  content?: string | TemplateResult | typeof nothing;
  level?: 2 | 3 | 4;
}) {
  const tag = unsafeStatic(`h${level}`);
  const classNames = tw`min-w-0 text-lg font-medium leading-8`;

  return staticHtml`
    <${tag} class=${classNames}>
      ${
        content ||
        html`<sl-skeleton class="my-.5 h-5 w-60" effect="sheen"></sl-skeleton>`
      }
    </${tag}>
  `;
}

export function page(
  header: Parameters<typeof pageHeader>[0] & {
    breadcrumbs?: Parameters<typeof pageNav>[0];
  },
  render: () => TemplateResult,
) {
  return html`<btrix-document-title
      title=${ifDefined(
        (typeof header.title === "string" && header.title) || undefined,
      )}
    ></btrix-document-title>

    <div
      class="mx-auto box-border flex min-h-full w-full max-w-screen-desktop flex-1 flex-col gap-3 p-3 lg:px-10 lg:pb-10"
    >
      ${header.breadcrumbs ? html` ${pageNav(header.breadcrumbs)} ` : nothing}
      ${pageHeader(header)}
      <main class="flex flex-1 flex-col">${render()}</main>
    </div>`;
}
