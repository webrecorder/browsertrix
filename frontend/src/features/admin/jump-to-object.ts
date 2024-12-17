import { BtrixElement } from "@/classes/BtrixElement";
import needLogin from "@/decorators/needLogin";
import { localized, msg } from "@lit/localize";
import { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement } from "lit/decorators";

@localized()
@customElement("browsertrix-app")
@needLogin
export class JumpToObject extends BtrixElement {
   render() {
    return html`
    <sl-dropdown>
      <sl-button slot="trigger" caret>${msg("Jump to Object")}</sl-button>
      <sl-menu @sl-select=${(e: SlSelectEvent) => {

      }}>
        <sl-menu-item value="crawl">${msg("Jump to Crawl")}</sl-menu-item>
        <sl-menu-item value="org">${msg("Jump to Org")}</sl-menu-item>
        <sl-menu-item value="user">${msg("Jump to User")}</sl-menu-item>
      </sl-menu>
    </sl-dropdown>
    `
  }
}

private renderFindCrawl() {
    return html`
      <sl-dropdown
        @sl-after-show=${(e: Event) => {
          (e.target as HTMLElement).querySelector("sl-input")?.focus();
        }}
        @sl-after-hide=${(e: Event) => {
          (e.target as HTMLElement).querySelector("sl-input")!.value = "";
        }}
        hoist
      >
        <button
          slot="trigger"
          class="font-medium text-primary-700 hover:text-primary"
        >
          ${msg("Jump to Crawl")}
        </button>

        <div class="p-2">
          <form
            @submit=${(e: SubmitEvent) => {
              e.preventDefault();
              const id = new FormData(e.target as HTMLFormElement).get(
                "crawlId",
              ) as string;
              this.routeTo(`/crawls/crawl/${id}#watch`);
              void (e.target as HTMLFormElement).closest("sl-dropdown")?.hide();
            }}
          >
            <div class="flex flex-wrap items-center">
              <div class="w-90 mr-2">
                <sl-input
                  size="small"
                  name="crawlId"
                  placeholder=${msg("Enter Crawl ID")}
                  required
                ></sl-input>
              </div>
              <div class="grow-0">
                <sl-button size="small" variant="neutral" type="submit">
                  <sl-icon slot="prefix" name="arrow-right-circle"></sl-icon>
                  ${msg("Go")}</sl-button
                >
              </div>
            </div>
          </form>
        </div>
      </sl-dropdown>
    `;
  }
