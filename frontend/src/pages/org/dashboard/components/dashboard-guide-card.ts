import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import type { SlIcon } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { docsUrlContext, type DocsUrlContext } from "@/context/docs-url";
import { type BtrixUserGuideShowEvent } from "@/events/btrix-user-guide-show";
import { tw } from "@/utils/tailwind";

/**
 * @slot title
 * @slot label
 * @cssPart base
 * @cssPart icon
 * @cssPart icon-background
 */
@customElement("btrix-dashboard-guide-card")
@localized()
export class DashboardGuideCard extends TailwindElement {
  @consume({ context: docsUrlContext })
  private readonly docsUrl?: DocsUrlContext;

  @property({ type: String })
  variant: "button" | "card" = "card";

  @property({ type: String })
  icon?: SlIcon["name"];

  @property({ type: String })
  path?: string;

  render() {
    const link = `${this.docsUrl}user-guide/${this.path}`;

    if (this.variant === "button") {
      return html`<a
        class="group flex h-full flex-col gap-3 rounded-lg border p-3 shadow transition-all duration-fast hover:shadow-none"
        href=${link}
        @click=${this.onClick}
        part="base"
      >
        <div class="flex justify-between">
          ${this.renderIcon()}
          <span
            class="text-xs text-neutral-500 opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus:opacity-100"
          >
            <slot name="label">${msg("View Guide")}</slot>
          </span>
        </div>
        <div class="leading-none">
          ${this.renderTitle()} ${this.renderBody()}
        </div>
      </a>`;
    }

    return html`<section
      class="${tw`[&:has(sl-button:hover)]:bg-neutral-50`} group flex h-full gap-3 p-3 transition-colors duration-fast focus-within:bg-neutral-50 @lg:items-center"
      part="base"
    >
      ${this.renderIcon()}
      <div
        class="flex flex-1 flex-col items-start justify-between gap-2 py-1 @lg:flex-row @lg:items-center @lg:py-0"
      >
        <div class="mb-2 leading-none @lg:mb-0">
          ${this.renderTitle()} ${this.renderBody()}
        </div>

        <sl-button-group class="[--sl-shadow-x-small:none]">
          <sl-button
            class="part-[label]:font-medium"
            size="small"
            href=${link}
            @click=${this.onClick}
            ><slot name="label">${msg("View Guide")}</slot></sl-button
          >
          <sl-tooltip content=${msg("Open in New Tab")} hoist>
            <sl-button
              class="part-[label]:px-2 part-[label]:font-medium"
              size="small"
              href=${link}
              target="_blank"
            >
              <sl-icon name="arrow-up-right"></sl-icon>
            </sl-button>
          </sl-tooltip>
        </sl-button-group>
      </div>
    </section>`;
  }

  private renderIcon() {
    if (!this.icon) return;

    return html`<div
      class="flex size-12 shrink-0 grow-0 items-center justify-center rounded-lg bg-neutral-50"
      part="icon-background"
    >
      <sl-icon
        class="size-6 text-neutral-400"
        part="icon"
        name=${this.icon}
      ></sl-icon>
    </div>`;
  }

  private renderTitle() {
    return html`<h3 class="mb-1.5 mt-0.5 font-medium">
      <slot name="title"></slot>
    </h3>`;
  }

  private renderBody() {
    return html`<p class="text-pretty text-xs text-neutral-700">
      <slot></slot>
    </p>`;
  }

  private readonly onClick = (e: MouseEvent) => {
    if (e.metaKey) return;

    e.preventDefault();

    this.dispatchEvent(
      new CustomEvent<BtrixUserGuideShowEvent["detail"]>(
        "btrix-user-guide-show",
        {
          detail: { path: this.path },
          bubbles: true,
          composed: true,
        },
      ),
    );
  };
}
