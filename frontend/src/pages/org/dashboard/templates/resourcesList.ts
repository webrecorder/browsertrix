import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { dashboardHeading } from "../layouts/dashboardHeading";

import { tw } from "@/utils/tailwind";

function externalLink({
  label,
  href,
  icon,
  rel,
}: {
  label: string | TemplateResult;
  href: string;
  icon: string;
  rel?: string;
}) {
  return html`<a
    class="group inline-flex items-center gap-2 font-medium text-primary-700 hover:text-primary-600"
    href=${href}
    target="_blank"
    rel=${ifDefined(rel)}
  >
    <sl-icon
      class="size-3.5 shrink-0 grow-0 text-neutral-500"
      name=${icon}
    ></sl-icon>
    ${label}
    <sl-icon
      class="shrink-0 grow-0 opacity-0 group-hover:opacity-100 group-focus:opacity-100"
      name="arrow-up-right"
    ></sl-icon>
  </a>`;
}

export function resourcesList() {
  return html`<section>
    ${dashboardHeading(msg("Resources"), { aside: true })}

    <ul class="${tw`[&>li:not(:last-of-type)]:mb-2.5`} @5xl:text-xs">
      <li>
        ${externalLink({
          label: msg("Community Forum"),
          icon: "chat-right-text",
          href: "https://forum.webrecorder.net/",
        })}
      </li>
      <li>
        ${externalLink({
          label: msg("Product Announcements"),
          icon: "megaphone",
          href: "https://webrecorder.net/blog/product/",
        })}
      </li>
      <li>
        ${externalLink({
          label: msg("Feature Roadmap"),
          icon: "kanban",
          href: "https://github.com/orgs/webrecorder/projects/9/views/20",
          rel: "noopener noreferrer nofollow",
        })}
      </li>
      <li>
        ${externalLink({
          label: msg(html`Webinars & Presentations`),
          icon: "youtube",
          href: "https://www.youtube.com/@webrecorder",
          rel: "noopener noreferrer nofollow",
        })}
      </li>
      <li>
        ${externalLink({
          label: msg("More Resources"),
          icon: "journal-bookmark",
          href: "https://webrecorder.net/resources/",
        })}
      </li>
    </ul>
  </section>`;
}
