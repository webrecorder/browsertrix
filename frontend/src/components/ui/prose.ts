import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, queryAsync, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * Display prose, like workflow and item descriptions, with line clamping.
 * Uses `overflow-hidden` as fallback
 *
 * @cssproperty --btrix-line-clamp
 */
@customElement("btrix-prose")
@localized()
export class Prose extends TailwindElement {
  static styles = css`
    :host {
      --btrix-line-clamp: 12;
    }
  `;

  @state()
  private clamped?: boolean;

  @queryAsync("pre")
  private readonly pre?: Promise<HTMLPreElement>;

  render() {
    return html`<pre
        class=${clsx(
          this.clamped !== false &&
            tw`line-clamp-[var(--btrix-line-clamp)] max-h-[15.75rem]`,
          tw`max-w-prose whitespace-pre-line font-sans leading-normal`,
        )}
      ><slot @slotchange=${this.onSlotChange}></slot></pre>
      ${this.clamped || this.clamped === false
        ? html`<button
            class="mt-1.5 leading-normal text-primary-500 transition-colors duration-fast hover:text-primary-600"
            @click=${() => (this.clamped = !this.clamped)}
          >
            ${this.clamped ? msg("Show more") : msg("Show less")}
          </button>`
        : nothing}`;
  }

  private async onSlotChange() {
    const pre = await this.pre;

    if (!pre) {
      console.debug("no pre");
      return;
    }

    this.clamped = pre.scrollHeight > pre.clientHeight;

    console.log(pre.clientHeight, pre.scrollHeight);
  }
}
