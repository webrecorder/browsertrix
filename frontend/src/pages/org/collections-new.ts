import type { PropertyValueMap, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { mergeDeep, removeIn } from "immutable";
import type { SlTextarea, SlCheckbox, SlInput } from "@shoelace-style/shoelace";

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
    [id: string]: Workflow;
  } = {};

  @state()
  private crawlsToAdd: Crawl[] = [];

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
          <div class="border rounded-lg p-6 flex-1">
            ${this.renderCrawlsInCollection()}
          </div>
        </section>
        <section class="col-span-1 flex flex-col">
          <h4 class="text-base font-semibold mb-3">${msg("All Workflows")}</h4>
          <div class="border rounded-lg p-6 flex-1">
            ${this.renderCrawlsNotInCollection()}
          </div>
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
      <ul>
        ${workflows.map(
          (workflow) => html`
            <li>
              <sl-checkbox></sl-checkbox>
              ${workflow.name || workflow.firstSeed}
            </li>
          `
        )}
      </ul>
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
      <ul>
        ${this.workflows.items.map(
          (workflow) => html`
            <li>
              <sl-checkbox
                ?checked=${this.selectedWorkflows[workflow.id]}
                @sl-change=${(e: Event) => {
                  const inputEl = e.target as SlCheckbox;
                  if (inputEl.checked) {
                    this.selectedWorkflows = mergeDeep(this.selectedWorkflows, {
                      [workflow.id]: workflow,
                    });
                  } else {
                    this.selectedWorkflows = removeIn(this.selectedWorkflows, [
                      workflow.id,
                    ]);
                  }
                }}
              ></sl-checkbox>
              ${workflow.name || workflow.firstSeed}
            </li>
          `
        )}
      </ul>
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
