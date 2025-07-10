import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlChangeEvent,
  SlCheckbox,
  SlInput,
  SlInputEvent,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import Fuse from "fuse.js";
import { html, nothing, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import queryString from "query-string";
import { isFocusable } from "tabbable";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { type APIPaginatedList } from "@/types/api";
import { type Profile } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

const MAX_PROFILES_IN_LABEL = 5;

export type BtrixChangeWorkflowProfileFilterEvent = BtrixChangeEvent<
  string[] | undefined
>;

/**
 * @fires btrix-change
 */
@customElement("btrix-workflow-profile-filter")
@localized()
export class WorkflowProfileFilter extends BtrixElement {
  @property({ type: Array })
  profiles?: string[];

  @state()
  private searchString = "";

  @query("sl-input")
  private readonly input?: SlInput | null;

  @queryAll("sl-checkbox")
  private readonly checkboxes!: NodeListOf<SlCheckbox>;

  private readonly fuse = new Fuse<Profile>([], {
    keys: ["id", "name", "origins"],
  });

  private selected = new Map<string, boolean>();

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("profiles")) {
      if (this.profiles) {
        this.selected = new Map(this.profiles.map((tag) => [tag, true]));
      } else if (changedProperties.get("profiles")) {
        this.selected = new Map();
      }
    }
  }

  private readonly profilesTask = new Task(this, {
    task: async () => {
      const query = queryString.stringify(
        {
          pageSize: 1000,
          page: 1,
        },
        {
          arrayFormat: "comma",
        },
      );
      const { items } = await this.api.fetch<APIPaginatedList<Profile>>(
        `/orgs/${this.orgId}/profiles?${query}`,
      );

      this.fuse.setCollection(items);

      // Match fuse shape
      return items.map((item) => ({ item }));
    },
    args: () => [] as const,
  });

  render() {
    return html`
      <btrix-filter-chip
        ?checked=${!!this.profiles?.length}
        selectFromDropdown
        stayOpenOnChange
        @sl-after-show=${() => {
          if (this.input && !this.input.disabled) {
            this.input.focus();
          }
        }}
        @sl-after-hide=${() => {
          this.searchString = "";

          const selectedProfiles = [];

          for (const [profile, value] of this.selected) {
            if (value) {
              selectedProfiles.push(profile);
            }
          }

          this.dispatchEvent(
            new CustomEvent<BtrixChangeEvent["detail"]>("btrix-change", {
              detail: {
                value: selectedProfiles.length ? selectedProfiles : undefined,
              },
            }),
          );
        }}
      >
        ${this.profiles?.length
          ? html`<span class="opacity-75">${msg("Profiles")}</span>
              ${this.renderProfilesInLabel(this.profiles)}`
          : msg("Browser Profile")}

        <div
          slot="dropdown-content"
          class="flex max-h-[var(--auto-size-available-height)] max-w-[var(--auto-size-available-width)] flex-col overflow-hidden rounded border bg-white text-left"
        >
          <header
            class=${clsx(
              this.profilesTask.value && tw`border-b`,
              tw`flex-shrink-0 flex-grow-0 overflow-hidden rounded-t bg-white pb-3`,
            )}
          >
            <sl-menu-label
              class="min-h-[var(--sl-input-height-small)] part-[base]:flex part-[base]:items-center part-[base]:justify-between part-[base]:gap-4 part-[base]:px-3"
            >
              <div
                id="profile-list-label"
                class="leading-[var(--sl-input-height-small)]"
              >
                ${msg("Filter by Browser Profile")}
              </div>
              ${this.profiles?.length
                ? html`<sl-button
                    variant="text"
                    size="small"
                    class="part-[label]:px-0"
                    @click=${() => {
                      this.checkboxes.forEach((checkbox) => {
                        checkbox.checked = false;
                      });

                      this.dispatchEvent(
                        new CustomEvent<BtrixChangeEvent["detail"]>(
                          "btrix-change",
                          {
                            detail: {
                              value: undefined,
                            },
                          },
                        ),
                      );
                    }}
                    >${msg("Clear")}</sl-button
                  >`
                : nothing}
            </sl-menu-label>

            <div class="px-3">${this.renderSearch()}</div>
          </header>

          ${this.profilesTask.render({
            complete: (profiles) => {
              let options = profiles;

              if (profiles.length && this.searchString) {
                options = this.fuse.search(this.searchString);
              }

              if (options.length) {
                return this.renderList(options);
              }

              return html`<div class="p-3 text-neutral-500">
                ${this.searchString
                  ? msg("No matching profiles found.")
                  : msg("No profiles found.")}
              </div>`;
            },
          })}
        </div>
      </btrix-filter-chip>
    `;
  }

  private renderProfilesInLabel(profiles: string[]) {
    const formatter2 = this.localize.list(
      profiles.length > MAX_PROFILES_IN_LABEL
        ? [
            ...profiles.slice(0, MAX_PROFILES_IN_LABEL),
            msg(
              str`${this.localize.number(profiles.length - MAX_PROFILES_IN_LABEL)} more`,
            ),
          ]
        : profiles,
    );

    return formatter2.map((part, index, array) =>
      part.type === "literal"
        ? html`<span class="opacity-75">${part.value}</span>`
        : profiles.length > MAX_PROFILES_IN_LABEL && index === array.length - 1
          ? html`<span class="text-primary-500"> ${part.value} </span>`
          : html`<span>${part.value}</span>`,
    );
  }

  private renderSearch() {
    return html`
      <label for="profile-search" class="sr-only"
        >${msg("Filter profiles")}</label
      >
      <sl-input
        class="min-w-[30ch]"
        id="profile-search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="profile-listbox"
        aria-activedescendant="profile-selected-option"
        value=${this.searchString}
        placeholder=${msg("Search for profile")}
        size="small"
        ?disabled=${!this.profilesTask.value?.length}
        @sl-input=${(e: SlInputEvent) =>
          (this.searchString = (e.target as SlInput).value)}
        @keydown=${(e: KeyboardEvent) => {
          // Prevent moving to next tabbable element since dropdown should close
          if (e.key === "Tab") e.preventDefault();
          if (e.key === "ArrowDown" && isFocusable(this.checkboxes[0])) {
            this.checkboxes[0].focus();
          }
        }}
      >
        ${this.profilesTask.render({
          pending: () => html`<sl-spinner slot="prefix"></sl-spinner>`,
          complete: () => html`<sl-icon slot="prefix" name="search"></sl-icon>`,
        })}
      </sl-input>
    `;
  }

  private renderList(opts: { item: Profile }[]) {
    const profile = (profile: Profile) => {
      const checked = this.selected.get(profile.id) === true;

      return html`
        <li role="option" aria-checked=${checked}>
          <sl-checkbox
            class="w-full part-[label]:flex part-[base]:w-full part-[label]:w-full part-[label]:items-center part-[label]:justify-between part-[base]:rounded part-[base]:p-2 part-[base]:hover:bg-primary-50"
            value=${profile.id}
            ?checked=${checked}
            >${profile.name}
          </sl-checkbox>
        </li>
      `;
    };

    return html`
      <ul
        id="profile-listbox"
        class="flex-1 overflow-auto p-1"
        role="listbox"
        aria-labelledby="profile-list-label"
        aria-multiselectable="true"
        @sl-change=${async (e: SlChangeEvent) => {
          const { checked, value } = e.target as SlCheckbox;

          this.selected.set(value, checked);
        }}
      >
        ${repeat(
          opts,
          ({ item }) => item,
          ({ item }) => profile(item),
        )}
      </ul>
    `;
  }
}
