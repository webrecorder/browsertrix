import type WaSlider from "@awesome.me/webawesome/dist/components/slider/slider.js";
import { localized, msg } from "@lit/localize";
import type { SlCheckbox, SlInput } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { iconFor, labelFor } from "@/features/qa/review-status";
import { isNotEqual } from "@/utils/is-not-equal";
import { tw } from "@/utils/tailwind";

type ChangeReviewStatusEventDetails = [number, number] | null;

export type BtrixChangeReviewStatusFilterEvent =
  BtrixChangeEvent<ChangeReviewStatusEventDetails>;

/**
 * @fires btrix-change
 */
@customElement("btrix-review-status-filter")
@localized()
export class ReviewStatusFilter extends BtrixElement {
  @property({ type: Array })
  reviewStatus?: [number, number] | null = null;

  @query("sl-input")
  private readonly input?: SlInput | null;

  @queryAll("sl-checkbox")
  private readonly checkboxes!: NodeListOf<SlCheckbox>;

  @state({ hasChanged: isNotEqual })
  selected: [number, number] | null = null;

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("reviewStatus")) {
      if (this.reviewStatus) {
        this.selected = this.reviewStatus;
      } else if (changedProperties.get("reviewStatus")) {
        this.selected = null;
      }
    }
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("selected")) {
      this.dispatchEvent(
        new CustomEvent<
          BtrixChangeEvent<ChangeReviewStatusEventDetails>["detail"]
        >("btrix-change", {
          detail: {
            value: this.selected,
          },
        }),
      );
    }
  }

  render() {
    return html`
      <btrix-filter-chip
        ?checked=${!!this.reviewStatus?.length}
        selectFromDropdown
        stayOpenOnChange
        @sl-after-show=${() => {
          if (this.input && !this.input.disabled) {
            this.input.focus();
          }
        }}
      >
        ${this.reviewStatus?.length
          ? html`<span class="opacity-75">${msg("Reviewed")}</span>
              ${this.renderStatesInLabel(this.reviewStatus)}`
          : msg("QA Review")}

        <div
          slot="dropdown-content"
          class="flex max-h-[var(--auto-size-available-height)] min-w-56 max-w-[var(--auto-size-available-width)] flex-col overflow-hidden rounded border bg-white text-left shadow-md"
        >
          <header
            class="flex-shrink-0 flex-grow-0 overflow-hidden rounded-t border-b"
          >
            <sl-menu-label
              class="min-h-[var(--sl-input-height-small)] part-[base]:flex part-[base]:items-center part-[base]:justify-between part-[base]:gap-4 part-[base]:px-3"
            >
              <div
                id="tag-list-label"
                class="leading-[var(--sl-input-height-small)]"
              >
                ${msg("Filter by QA Review")}
              </div>
              ${this.reviewStatus?.length
                ? html`<sl-button
                    variant="text"
                    size="small"
                    class="part-[label]:px-0"
                    @click=${() => {
                      this.checkboxes.forEach((checkbox) => {
                        checkbox.checked = false;
                      });

                      this.dispatchEvent(
                        new CustomEvent<
                          BtrixChangeEvent<ChangeReviewStatusEventDetails>["detail"]
                        >("btrix-change", {
                          detail: {
                            value: null,
                          },
                        }),
                      );
                    }}
                    >${msg("Clear")}</sl-button
                  >`
                : html`<span class="opacity-50">${msg("Any")}</span>`}
            </sl-menu-label>
          </header>
          <wa-slider
            class=${clsx(
              "px-4 pb-2 pt-4",
              this.reviewStatus === null &&
                tw`[--wa-form-control-activated-color:--sl-color-neutral-200]`,
            )}
            range
            min="1"
            max="5"
            min-value="${this.reviewStatus?.[0] ?? 0}"
            max-value="${this.reviewStatus?.[1] ?? 5}"
            with-tooltip
            with-markers
            .valueFormatter=${(value: number) => {
              return html`<btrix-qa-review-status
                status="${value}"
                onDark
              ></btrix-qa-review-status>` as unknown as string;
            }}
            @input=${(event: CustomEvent<{ value: number[] }>) => {
              const value = [
                (event.target as WaSlider).minValue,
                (event.target as WaSlider).maxValue,
              ];
              this.reviewStatus = value as [number, number];
            }}
            @click=${() => {
              if (!this.reviewStatus) this.reviewStatus = [1, 5];
            }}
          >
            ${this.renderSliderLabel(1, "before")}
            ${this.renderSliderLabel(5, "after")}
          </wa-slider>
        </div>
      </btrix-filter-chip>
    `;
  }

  private renderSliderLabel(value: number, position: "before" | "after") {
    const icon = iconFor(value);
    return html`<span
      class="mt-1.5 flex items-center gap-1 text-xs text-neutral-500"
      slot="reference"
      >${position === "before"
        ? html`<sl-icon
              name=${icon.name}
              class=${clsx(icon.class, "-ml-2 size-4")}
            ></sl-icon
            >${labelFor(value)}`
        : html`${labelFor(value)}<sl-icon
              name=${icon.name}
              class=${clsx(icon.class, "-mr-2 size-4")}
            ></sl-icon>`}</span
    >`;
  }

  private renderStatesInLabel(reviewStatus: [number, number] | null) {
    if (!reviewStatus) return;
    const [min, max] = reviewStatus;
    if (min === 1 && max === 5) {
      return msg("Any");
    }
    const from = html`<btrix-qa-review-status
      class="ml-1 inline-block align-[-3px]"
      status="${min}"
    ></btrix-qa-review-status>`;
    if (min === max) {
      return from;
    }
    const to = html`<btrix-qa-review-status
      class="inline-block align-[-3px]"
      status="${max}"
    ></btrix-qa-review-status>`;

    const separator = html`<span class="opacity-75"> - </span>`;

    return html`${from}${separator}${to}`;
  }
}
