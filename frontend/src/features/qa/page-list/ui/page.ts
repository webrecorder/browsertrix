import { localized, msg } from "@lit/localize";
import type { SlTooltip } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import {
  iconFor,
  issueCounts,
  maxSeverity,
  severityFromMatch,
  textColorFromSeverity,
} from "../helpers";
import { approvalFromPage } from "../helpers/approval";
import { isQaPage, type Page } from "../helpers/page";

import { animateTo, shimKeyframesHeightAuto } from "./animate";
import { formatPercentage, pageDetails } from "./page-details";

import { TailwindElement } from "@/classes/TailwindElement";
import type { ArchivedItemQAPage } from "@/types/qa";
import { tw } from "@/utils/tailwind";

@customElement("btrix-qa-page")
@localized()
export class QaPage extends TailwindElement {
  @property({ type: Object })
  page?: Page;

  @property({ type: String })
  statusField: "textMatch" | "screenshotMatch" | "approved" = "screenshotMatch";

  @property({ type: Boolean })
  selected = false;

  @query(".contentContainer")
  private readonly contentContainer?: HTMLElement;

  @query("sl-tooltip")
  private readonly tooltip?: SlTooltip;

  private readonly select = async () => {
    if (this.selected) return;

    void this.tooltip?.hide();
    this.dispatchEvent(
      new CustomEvent<string>("btrix-qa-page-select", {
        detail: this.page!.id,
        composed: true,
        bubbles: true,
      }),
    );
  };

  private readonly animateExpand = async () => {
    if (!this.contentContainer) return;
    await animateTo(
      this.contentContainer,
      shimKeyframesHeightAuto(
        [
          {
            height: "0",
            opacity: "0",
            overflow: "hidden",
            transform: `translateY(-2px)`,
          },
          {
            height: "auto",
            opacity: "1",
            overflow: "hidden",
            transform: `translateY(0)`,
          },
        ],
        this.contentContainer.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  private readonly animateCollapse = async () => {
    if (!this.contentContainer) return;
    await animateTo(
      this.contentContainer,
      shimKeyframesHeightAuto(
        [
          {
            height: "auto",
            opacity: "1",
            overflow: "hidden",
            transform: `translateY(0)`,
          },
          {
            height: "0",
            opacity: "0",
            overflow: "hidden",
            transform: `translateY(-2px)`,
          },
        ],
        this.contentContainer.scrollHeight,
      ),
      { duration: 250, easing: "cubic-bezier(0.4, 0.0, 0.2, 1)" },
    );
  };

  protected async updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("selected")) {
      if (this.selected) {
        this.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        await this.animateExpand();
      } else if (changedProperties.get("selected") === true) {
        void this.animateCollapse();
      }
    }
  }

  render() {
    const page = this.page;
    if (!page) return;

    const qaPage = isQaPage(page);

    return html`
      <div class="py-1.5 text-sm text-gray-600">
        <div
          class=${clsx(
            qaPage ? tw`ml-4 pl-6` : tw`ml-2`,
            tw`relative z-20 block flex-auto cursor-pointer select-none overflow-visible rounded border border-solid border-gray-300 bg-white px-4 py-2  shadow-none outline-none transition-shadow  aria-selected:border-blue-500 aria-selected:bg-blue-50 aria-selected:shadow aria-selected:shadow-blue-800/20 aria-selected:transition-none`,
          )}
          @click=${this.select}
          tabindex="0"
          aria-selected=${this.selected}
        >
          ${qaPage ? this.renderPopover(page) : nothing}
          <h5 class="truncate text-sm font-semibold text-black">
            ${page.title ||
            html`<span class="opacity-50">${msg("No page title")}</span>`}
          </h5>
          <div class="truncate text-xs leading-4 text-blue-600">
            ${page.url}
          </div>
        </div>
        <div
          class="contentContainer ${this.selected
            ? "h-auto"
            : "h-0"} overflow-hidden contain-content content-auto"
        >
          ${qaPage
            ? html`<div
                class="z-10 -mt-2 ml-6 mr-2 rounded-b-lg border border-solid border-gray-200 bg-neutral-0 px-4 pb-1 pt-4"
              >
                ${pageDetails(page)}
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  private renderPopover(page: ArchivedItemQAPage) {
    let { severe, moderate } = issueCounts(page);

    const statusIcon =
      approvalFromPage(page) ??
      {
        screenshotMatch: severityFromMatch(page.qa.screenshotMatch),
        textMatch: severityFromMatch(page.qa.textMatch),
        approved: approvalFromPage(page) ?? maxSeverity(page),
      }[this.statusField];

    if (statusIcon === "severe") severe--;
    if (statusIcon === "moderate") moderate--;

    return html`
      <btrix-popover placement="left">
        <div slot="content" class="max-w-60 text-xs">${pageDetails(page)}</div>
        <div
          class="absolute -left-4 top-[50%] flex w-8 translate-y-[-50%] flex-col place-items-center gap-1 rounded-full border border-gray-300 bg-neutral-0 p-2 leading-[14px] shadow transition-transform hover:scale-110"
        >
          ${iconFor(statusIcon)}
          ${this.statusField === "screenshotMatch" ||
          this.statusField === "textMatch"
            ? html`<span
                class="${clsx(
                  "text-[10px] font-semibold tracking-tighter tabular-nums",
                  textColorFromSeverity(
                    severityFromMatch(page.qa[this.statusField]),
                  ),
                )}"
                >${formatPercentage(page.qa[this.statusField] ?? 0, 0)}%</span
              >`
            : html`<span
                class="${clsx(
                  "text-[10px] font-semibold",
                  textColorFromSeverity(severe > 0 ? "severe" : "moderate"),
                  severe === 0 && moderate === 0 && "hidden",
                )}"
                >+${severe || moderate}</span
              >`}
          ${page.notes?.[0] &&
          html`<sl-icon
            name="chat-square-text-fill"
            class="text-blue-600"
          ></sl-icon>`}
        </div>
      </btrix-popover>
    `;
  }
}
