import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { dashboardHeading } from "../layouts/dashboardHeading";

import { tw } from "@/utils/tailwind";

function externalLink({
  label,
  href,
  rel,
}: {
  label: string | TemplateResult;
  href: string;
  rel?: string;
}) {
  return html`<a
    class="group inline-flex items-center gap-1 text-primary-700 hover:text-primary-600"
    href=${href}
    target="_blank"
    rel=${ifDefined(rel)}
  >
    ${label}
    <sl-icon
      class="opacity-0 group-hover:opacity-100 group-focus:opacity-100"
      name="arrow-up-right"
    ></sl-icon>
  </a>`;
}

export function resourcesList() {
  return html`<section class="@5xl/org:first:mt-2">
    ${dashboardHeading(msg("Resources"), { aside: true })}

    <ul class="${tw`[&>li:not(:last-of-type)]:mb-2.5`} @5xl:text-xs">
      <li>
        ${externalLink({
          label: msg("What is Web Archiving?"),
          href: "https://webrecorder.net/resources/what-is-web-archiving/",
        })}
      </li>
      <li>
        ${externalLink({
          label: msg("Glossary of Terms"),
          href: "https://webrecorder.net/resources/glossary/",
        })}
      </li>
      <li>
        ${externalLink({
          label: msg("Community Forum"),
          href: "https://forum.webrecorder.net/",
        })}
      </li>
      <li>
        ${externalLink({
          label: msg("Product Announcements"),
          href: "https://webrecorder.net/blog/product/",
        })}
      </li>
      <li>
        ${externalLink({
          label: msg(html`Webinars & Presentations`),
          href: "https://www.youtube.com/@webrecorder",
          rel: "noopener noreferrer nofollow",
        })}
      </li>
    </ul>
  </section>`;
}
