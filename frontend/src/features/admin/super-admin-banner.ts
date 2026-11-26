import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { tw } from "@/utils/tailwind";

@customElement("btrix-super-admin-banner")
@localized()
export class SuperAdminBanner extends BtrixElement {
  @state()
  hide = false;

  render() {
    if (this.hide) {
      return html` <div
        class=${clsx(
          tw`absolute bottom-0 right-2 top-0`,
          this.appState.userGuideOpen ? tw`pr-16` : tw`pt-[3.45rem]`,
        )}
      >
        <sl-tooltip
          placement="left"
          class="[--max-width:500px] [--show-delay:0] part-[base__arrow]:bg-warning-700 part-[body]:bg-warning-700 part-[body]:text-xs"
          hoist
        >
          <span slot="content">
            <strong>${msg("You are logged in as a superadmin")}</strong> –
            ${msg("please be careful.")}
          </span>
          <div class="sticky right-2 top-2 z-[999]">
            <button
              type="button"
              class="flex rounded-full border border-warning-800 bg-warning-700 p-2 text-warning-50 shadow-md shadow-orange-700/20 transition hover:scale-110"
              @click=${() => {
                this.hide = false;
              }}
            >
              <sl-icon
                slot="icon"
                name="exclamation-diamond-fill"
                class="size-4"
              ></sl-icon>
            </button>
          </div>
        </sl-tooltip>
      </div>`;
    } else {
      return html`<div
        class="sticky top-0 z-[999] border-b border-b-warning-800 bg-warning-700 py-2 text-xs text-warning-50 shadow-sm shadow-orange-700/20"
      >
        <div
          class="mx-auto box-border flex w-full items-center gap-2 px-3 xl:pl-6"
        >
          <sl-icon name="exclamation-diamond-fill" class="size-4"></sl-icon>
          <span>
            <strong>${msg("You are logged in as a superadmin")}</strong> –
            ${msg("please be careful.")}
          </span>
          <button
            type="button"
            class="ml-auto flex"
            @click=${() => {
              this.hide = true;
            }}
          >
            <sl-icon name="x-circle" class="size-4"></sl-icon>
          </button>
        </div>
      </div>`;
    }
  }
}
