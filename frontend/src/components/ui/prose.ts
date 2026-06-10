import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing, type PropertyValues } from "lit";
import { customElement, queryAsync, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

export type ProseClampingEvent = CustomEvent<{
  clamping: boolean;
  clamped: boolean;
}>;

/**
 * Display prose, like workflow and item descriptions, with line clamping.
 * Uses `overflow-hidden` as fallback
 *
 * @cssproperty --btrix-line-clamp
 * @cssPart base
 * @cssPart content
 * @cssPart button
 * @fires btrix-prose-clamping
 */
@customElement("btrix-prose")
@localized()
export class Prose extends TailwindElement {
  static styles = css`
    :host {
      --btrix-line-clamp: 6;
      display: contents;
    }

    .clamp {
      max-height: calc(var(--btrix-line-clamp) * 1.3125rem);
    }
  `;

  @state()
  private clamped?: boolean;

  @queryAsync("pre")
  private readonly pre?: Promise<HTMLPreElement>;

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.has("clamped")) {
      this.dispatchEvent(
        new CustomEvent<ProseClampingEvent["detail"]>("btrix-prose-clamping", {
          detail: {
            clamping: this.clamped !== undefined,
            clamped: this.clamped === true,
          },
        }),
      );
    }
  }

  render() {
    return html`<div part="base">
        <pre
          class=${clsx(
            this.clamped !== false && [
              tw`line-clamp-[--btrix-line-clamp]`,
              "clamp",
            ],
            tw`max-w-prose hyphens-auto whitespace-pre-line text-pretty font-sans leading-normal`,
          )}
          part="content"
        ><slot @slotchange=${this.onSlotChange}></slot></pre>
        <slot name="suffix"></slot>
      </div>
      ${this.clamped || this.clamped === false
        ? html`<button
            class="whitespace-nowrap leading-normal text-primary-500 transition-colors duration-fast hover:text-primary-600"
            @click=${() => (this.clamped = !this.clamped)}
            part="button"
          >
            ${this.clamped ? msg("Show more") : msg("Show less")}
          </button>`
        : nothing}`;
  }

  private onSlotChange() {
    void this.syncClamp();
  }

  async syncClamp() {
    const pre = await this.pre;

    if (!pre) {
      console.debug("no pre");
      return;
    }

    this.clamped =
      pre.scrollHeight === pre.clientHeight
        ? undefined
        : pre.scrollHeight > pre.clientHeight;
  }
}
