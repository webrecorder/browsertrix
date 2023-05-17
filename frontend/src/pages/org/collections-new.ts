import type { PropertyValueMap, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { mergeDeep } from "immutable";
import omit from "lodash/fp/omit";
import type {
  SlTextarea,
  SlCheckbox,
  SlInput,
  SlIconButton,
} from "@shoelace-style/shoelace";

import type {
  CheckboxChangeEvent,
  CheckboxGroupList,
} from "../../components/checkbox-list";
import type { MarkdownChangeEvent } from "../../components/markdown-editor";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { APIPaginatedList } from "../../types/api";
import type { Crawl, Workflow } from "./types";

const TABS = ["crawls", "metadata"] as const;
type Tab = (typeof TABS)[number];
type Collection = {
  name: string;
  description: string | null;
  crawlIds: string[];
};
type FormState = {
  name: string;
  description: string | null;
  workflows: any[];
};

@localized()
export class CollectionsNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @state()
  private collection?: Collection;

  @state()
  private workflows?: APIPaginatedList & {
    items: Workflow[];
  };

  @state()
  private selectedWorkflows: {
    [workflowId: string]: Workflow;
  } = {};

  @state()
  private selectedCrawls: {
    [crawlId: string]: Crawl;
  } = {};

  @state()
  private activeTab: Tab = TABS[0];

  @state()
  private formState: FormState = {
    name: "",
    description: "",
    workflows: [],
  };

  @state()
  private isSubmitting = false;

  @state()
  private serverError?: string;

  @state()
  private isPreviewingDescription = true;

  private readonly tabLabels: Record<Tab, string> = {
    crawls: msg("Select Crawls"),
    metadata: msg("Metadata"),
  };

  protected async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      this.fetchWorkflows();
    }
  }

  connectedCallback(): void {
    // Set initial active section and dialog based on URL #hash value
    this.getActivePanelFromHash();
    super.connectedCallback();
    window.addEventListener("hashchange", this.getActivePanelFromHash);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.getActivePanelFromHash);
  }

  render() {
    return html`${this.renderHeader()}
      <h2 class="text-xl font-semibold mb-6">${msg("New Collection")}</h2>
      ${this.renderEditor()}`;
  }

  private renderHeader = () => html`
    <nav class="mb-5">
      <a
        class="text-gray-600 hover:text-gray-800 text-sm font-medium"
        href=${`/orgs/${this.orgId}/collections`}
        @click=${this.navLink}
      >
        <sl-icon name="arrow-left" class="inline-block align-middle"></sl-icon>
        <span class="inline-block align-middle"
          >${msg("Back to Collections")}</span
        >
      </a>
    </nav>
  `;

  private renderEditor() {
    return html`<form name="newCollection" @submit=${this.onSubmit}>
      <btrix-tab-list
        activePanel="newCollection-${this.activeTab}"
        progressPanel="newCollection-${this.activeTab}"
      >
        <h3 slot="header" class="font-semibold">
          ${this.tabLabels[this.activeTab]}
        </h3>

        ${TABS.map(this.renderTab)}

        <btrix-tab-panel name="newCollection-crawls">
          ${this.renderCrawls()}
        </btrix-tab-panel>
        <btrix-tab-panel name="newCollection-metadata">
          ${this.renderMetadata()}
        </btrix-tab-panel>
      </btrix-tab-list>
    </form>`;
  }

  private renderTab = (tab: Tab) => {
    const isActive = tab === this.activeTab;
    const completed = false; // TODO
    const iconProps = {
      name: "circle",
      library: "default",
      class: "text-neutral-400",
    };
    if (isActive) {
      iconProps.name = "pencil-circle-dashed";
      iconProps.library = "app";
      iconProps.class = "text-base";
    } else if (completed) {
      iconProps.name = "check-circle";
    }

    return html`
      <btrix-tab
        slot="nav"
        name="newCollection-${tab}"
        class="whitespace-nowrap"
        @click=${() => this.goToTab(tab)}
      >
        <sl-icon
          name=${iconProps.name}
          library=${iconProps.library}
          class="inline-block align-middle mr-1 text-base ${iconProps.class}"
        ></sl-icon>
        <span class="inline-block align-middle whitespace-normal">
          ${this.tabLabels[tab]}
        </span>
      </btrix-tab>
    `;
  };

  private renderCrawls() {
    return html`
      <section class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">
            ${msg("Crawls in Collection")}
          </h4>
          <div class="border rounded-lg px-2 py-4 flex-1">
            ${this.renderCrawlsInCollection()}
          </div>
        </section>
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">${msg("All Workflows")}</h4>
          <div class="flex-1">${this.renderCrawlsNotInCollection()}</div>
        </section>
        <footer
          class="col-span-2 border rounded-lg px-6 py-4 flex justify-between"
        >
          <sl-button
            variant="primary"
            size="small"
            class="ml-auto"
            @click=${() => this.goToTab("metadata")}
          >
            <sl-icon slot="suffix" name="chevron-right"></sl-icon>
            ${msg("Next Step")}
          </sl-button>
        </footer>
      </section>
    `;
  }

  private renderMetadata() {
    return html`
      <section class="border rounded-lg">
        <div class="p-6 grid grid-cols-5 gap-4">
          ${this.renderFormCol(html`
            <sl-input
              class="mb-4"
              name="name"
              label=${msg("Name")}
              autocomplete="off"
              placeholder=${msg("My Collection")}
              value=${this.formState.name}
              required
              @sl-change=${(e: CustomEvent) => {
                const inputEl = e.target as SlInput;
                this.updateFormState({
                  [inputEl.name]: inputEl.value,
                });
              }}
            ></sl-input>
          `)}
          ${this.renderHelpTextCol(msg("TODO"))}
          ${this.renderFormCol(html`
            <h4 class="form-label">${msg("Description")}</h4>
            <btrix-markdown-editor
              initialValue=${this.formState.description}
              @on-change=${(e: MarkdownChangeEvent) => {
                this.updateFormState({
                  description: e.detail.value,
                });
              }}
            ></btrix-markdown-editor>
          `)}
          ${this.renderHelpTextCol(msg("TODO"))}
        </div>
        <footer class="border-t px-6 py-4 flex justify-between">
          <sl-button size="small" @click=${() => this.goToTab("crawls")}>
            <sl-icon slot="prefix" name="chevron-left"></sl-icon>
            ${msg("Previous Step")}
          </sl-button>
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Save New Collection")}
          </sl-button>
        </footer>
      </section>
    `;
  }

  private renderCrawlsInCollection() {
    const workflows = Object.values(this.selectedWorkflows);
    if (!workflows.length) {
      return html`
        <div>
          <span class="text-base font-semibold"
            >${msg("Add Crawls to this Collection")}</span
          >
          <p>
            ${msg(
              "Select finished crawls to include them in this collection. You can always come back and add them later."
            )}
          </p>
        </div>
      `;
    }

    return html`
      <btrix-checkbox-list>
        ${workflows.map((workflow) => this.renderWorkflowItem(workflow))}
      </btrix-checkbox-list>
    `;
  }

  private renderWorkflowItem(workflow: Workflow) {
    const crawlIds = Object.keys(this.selectedCrawls).filter((id) =>
      id.startsWith(workflow.id)
    );
    const someChecked = crawlIds.length > 0;
    const allChecked = crawlIds.length === workflow.crawlCount;
    return html`
      <btrix-checkbox-list-item
        ?checked=${someChecked}
        ?allChecked=${allChecked}
        group
        aria-controls=${crawlIds.join(" ")}
        @on-change=${(e: CheckboxChangeEvent) => {
          const allCrawlIds = Array.from({ length: workflow.crawlCount }).map(
            (x, i) => `${workflow.id}___${i + 1}`
          );
          const checkAll = () => {
            const allCrawls = allCrawlIds.reduce(
              (acc: any, id: any) => ({
                ...acc,
                [id]: { id },
              }),
              {}
            );
            this.selectedCrawls = mergeDeep(this.selectedCrawls, allCrawls);
          };
          if (e.detail.checked) {
            checkAll();
          } else if (allChecked) {
            this.selectedCrawls = omit(allCrawlIds)(this.selectedCrawls) as any;
          } else {
            checkAll();
          }
        }}
      >
        <div class="flex-0 flex justify-between">
          ${this.renderWorkflowDetails(workflow)}
          <div class="border-l flex items-center justify-center">
            <sl-icon-button
              class="expandBtn p-2 text-lg"
              name="chevron-double-down"
              aria-expanded="true"
              aria-controls=${`workflow-${workflow.id}`}
              @click=${this.onWorkflowExpandClick}
            ></sl-icon-button>
          </div>
        </div>
        <div
          id=${`workflow-${workflow.id}-group`}
          slot="group"
          class="checkboxGroup transition-all overflow-hidden"
        >
          <btrix-checkbox-group-list>
            ${Array.from({ length: workflow.crawlCount }).map(
              (x, i) => html`
                <btrix-checkbox-list-item
                  id=${`${workflow.id}___${i + 1}`}
                  ?checked=${this.selectedCrawls[`${workflow.id}___${i + 1}`]}
                  @on-change=${(e: CheckboxChangeEvent) => {
                    if (e.detail.checked) {
                      this.selectedCrawls = mergeDeep(this.selectedCrawls, {
                        [`${workflow.id}___${i + 1}`]: workflow,
                      });
                    } else {
                      this.selectedCrawls = omit([`${workflow.id}___${i + 1}`])(
                        this.selectedCrawls
                      ) as any;
                    }
                  }}
                  >TODO ${i + 1}</btrix-checkbox-list-item
                >
              `
            )}
          </btrix-checkbox-group-list>
        </div>
      </btrix-checkbox-list-item>
    `;
  }

  private renderWorkflowDetails(workflow: Workflow) {
    return html`
      <div class="flex-1 py-3">
        <div class="text-neutral-700 truncate h-6">
          ${this.renderName(workflow)}
        </div>
        <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
          <sl-format-date
            date=${workflow.lastCrawlTime}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </div>
      </div>
      <div class="w-28 flex-0 py-3">
        <div class="text-neutral-700 truncate h-6">
          <sl-format-bytes
            value=${workflow.totalSize}
            display="narrow"
          ></sl-format-bytes>
        </div>
        <div class="text-neutral-500 text-xs font-monostyle truncate h-4">
          ${workflow.crawlCount > 0
            ? msg(str`${workflow.crawlCount.toLocaleString()} crawls`)
            : msg("1 crawl")}
        </div>
      </div>
    `;
  }

  // TODO consolidate collections/workflow name
  private renderName(workflow: Workflow) {
    if (workflow.name)
      return html`<span class="truncate">${workflow.name}</span>`;
    if (!workflow.firstSeed)
      return html`<span class="truncate">${workflow.id}</span>`;
    const remainder = workflow.config.seeds.length - 1;
    let nameSuffix: any = "";
    if (remainder) {
      if (remainder === 1) {
        nameSuffix = html`<span class="ml-1 text-neutral-500"
          >${msg(str`+${remainder} URL`)}</span
        >`;
      } else {
        nameSuffix = html`<span class="ml-1 text-neutral-500"
          >${msg(str`+${remainder} URLs`)}</span
        >`;
      }
    }
    return html`
      <span class="break-all truncate">${workflow.firstSeed}</span>${nameSuffix}
    `;
  }

  private renderCrawlsNotInCollection() {
    if (!this.workflows) {
      return html`
        <div class="w-full flex items-center justify-center my-24 text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    return html`
      <btrix-checkbox-list>
        ${this.workflows.items.map(
          (workflow) => html`
            <btrix-checkbox-list-item
              ?checked=${this.selectedWorkflows[workflow.id]}
              @on-change=${(e: CheckboxChangeEvent) => {
                if (e.detail.checked) {
                  this.selectedWorkflows = mergeDeep(this.selectedWorkflows, {
                    [workflow.id]: workflow,
                  });
                } else {
                  this.selectedWorkflows = omit([workflow.id])(
                    this.selectedWorkflows
                  ) as any;
                }
              }}
            >
              <div class="flex justify-between">
                ${this.renderWorkflowDetails(workflow)}
              </div>
            </btrix-checkbox-list-item>
          `
        )}
      </btrix-checkbox-list>
    `;
  }

  private renderFormCol = (content: TemplateResult) => {
    return html`<div class="col-span-5 md:col-span-3">${content}</div> `;
  };

  private renderHelpTextCol(content: TemplateResult | string, padTop = true) {
    return html`
      <div class="col-span-5 md:col-span-2 flex${padTop ? " pt-6" : ""}">
        <div class="text-base mr-2">
          <sl-icon name="info-circle"></sl-icon>
        </div>
        <div class="mt-0.5 text-xs text-neutral-500">${content}</div>
      </div>
    `;
  }

  private onWorkflowExpandClick = (e: MouseEvent) => {
    const listItem = (e.target as HTMLElement).closest(
      "btrix-checkbox-list-item"
    );
    if (!listItem) {
      console.debug(e);
      return;
    }
    const checkboxGroup = listItem.querySelector(
      ".checkboxGroup"
    ) as HTMLElement;
    const expandBtn = listItem.querySelector(".expandBtn") as SlIconButton;
    const expanded = !(expandBtn.getAttribute("aria-expanded") === "true");
    expandBtn.setAttribute("aria-expanded", expanded.toString());

    if (expanded) {
      checkboxGroup.style.marginTop = "0px";
      checkboxGroup.style.pointerEvents = "auto";
    } else {
      checkboxGroup.style.marginTop = `-${checkboxGroup.clientHeight}px`;
      checkboxGroup.style.pointerEvents = "none";
    }
  };

  private getActivePanelFromHash = () => {
    const hashValue = window.location.hash.slice(1);
    if (TABS.includes(hashValue as any)) {
      this.activeTab = hashValue as Tab;
    } else {
      this.goToTab(TABS[0], { replace: true });
    }
  };

  private goToTab(tab: Tab, { replace = false } = {}) {
    const path = `${window.location.href.split("#")[0]}#${tab}`;
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    this.activeTab = tab;
  }

  private updateFormState(nextState: Partial<FormState>) {
    this.formState = mergeDeep(this.formState, nextState);
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    await this.updateComplete;

    const form = event.target as HTMLFormElement;
    if (form.querySelector("[data-invalid]")) {
      return;
    }

    const params: Collection = {
      name: this.formState.name,
      description: this.formState.description,
      crawlIds: [],
    };
    this.isSubmitting = true;
    console.log("submit", params);

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/collections/`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      console.log(data.added);

      this.notify({
        message: msg("Successfully created new Collection."),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      this.navTo(`/orgs/${this.orgId}/collections`);
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }

      console.log(this.serverError);
    }

    this.isSubmitting = false;
  }

  private async fetchWorkflows() {
    try {
      this.workflows = await this.getWorkflows();
      // TODO remove
      this.selectedWorkflows = {
        [this.workflows.items[0]!.id]: this.workflows.items[0],
        [this.workflows.items[1]!.id]: this.workflows.items[1],
      };
      const selectedCrawls = [
        ...Array.from({
          length: this.workflows.items[0].crawlCount,
        }).map((x, i) => ({
          id: `${this.workflows!.items[0]!.id}___${i + 1}`,
        })),
        ...Array.from({
          length: this.workflows.items[1].crawlCount,
        }).map((x, i) => ({
          id: `${this.workflows!.items[1]!.id}___${i + 1}`,
        })),
      ];
      this.selectedCrawls = selectedCrawls.reduce(
        (acc, curr: any) => ({
          ...acc,
          [curr.id]: curr,
        }),
        {}
      ) as any;
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve Workflows at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getWorkflows(): Promise<APIPaginatedList> {
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs`,
      this.authState!
    );

    return data;
  }
}
customElements.define("btrix-collections-new", CollectionsNew);
