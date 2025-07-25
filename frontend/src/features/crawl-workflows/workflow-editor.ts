import { consume } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
import type {
  SlBlurEvent,
  SlCheckbox,
  SlDetails,
  SlHideEvent,
  SlInput,
  SlRadio,
  SlRadioGroup,
  SlTextarea,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { createParser } from "css-selector-parser";
import Fuse from "fuse.js";
import { mergeDeep } from "immutable";
import type { LanguageCode } from "iso-639-1";
import {
  css,
  html,
  nothing,
  type LitElement,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  queryAsync,
  state,
} from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { map } from "lit/directives/map.js";
import { when } from "lit/directives/when.js";
import compact from "lodash/fp/compact";
import flow from "lodash/fp/flow";
import isEqual from "lodash/fp/isEqual";
import throttle from "lodash/fp/throttle";
import uniq from "lodash/fp/uniq";
import queryString from "query-string";

import {
  SELECTOR_DELIMITER,
  type LinkSelectorTable,
} from "./link-selector-table";

import { BtrixElement } from "@/classes/BtrixElement";
import type { BtrixFileChangeEvent } from "@/components/ui/file-list/events";
import type {
  SelectCrawlerChangeEvent,
  SelectCrawlerUpdateEvent,
} from "@/components/ui/select-crawler";
import type { SelectCrawlerProxyChangeEvent } from "@/components/ui/select-crawler-proxy";
import type { SyntaxInput } from "@/components/ui/syntax-input";
import type { TabListTab } from "@/components/ui/tab-list";
import type { TagInputEvent, TagsChangeEvent } from "@/components/ui/tag-input";
import type { TimeInputChangeEvent } from "@/components/ui/time-input";
import { validURL } from "@/components/ui/url-input";
import { docsUrlContext, type DocsUrlContext } from "@/context/docs-url";
import { proxiesContext, type ProxiesContext } from "@/context/org";
import {
  ObservableController,
  type IntersectEvent,
} from "@/controllers/observable";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { type SelectBrowserProfileChangeEvent } from "@/features/browser-profiles/select-browser-profile";
import type { CollectionsChangeEvent } from "@/features/collections/collections-add";
import type { CustomBehaviorsTable } from "@/features/crawl-workflows/custom-behaviors-table";
import type { CrawlStatusChangedEventDetail } from "@/features/crawl-workflows/live-workflow-status";
import type {
  ExclusionChangeEvent,
  QueueExclusionTable,
} from "@/features/crawl-workflows/queue-exclusion-table";
import type { UserGuideEventMap } from "@/index";
import { infoCol, inputCol } from "@/layouts/columns";
import { pageSectionsWithNav } from "@/layouts/pageSectionsWithNav";
import { panel } from "@/layouts/panel";
import { WorkflowTab } from "@/routes";
import { infoTextFor } from "@/strings/crawl-workflows/infoText";
import { labelFor } from "@/strings/crawl-workflows/labels";
import scopeTypeLabels from "@/strings/crawl-workflows/scopeType";
import sectionStrings from "@/strings/crawl-workflows/section";
import { AnalyticsTrackEvent } from "@/trackEvents";
import { APIErrorDetail } from "@/types/api";
import {
  Behavior,
  ScopeType,
  type Seed,
  type WorkflowParams,
} from "@/types/crawler";
import type { UnderlyingFunction } from "@/types/utils";
import {
  NewWorkflowOnlyScopeType,
  type StorageSeedFile,
  type WorkflowTag,
  type WorkflowTags,
} from "@/types/workflow";
import { track } from "@/utils/analytics";
import { isApiError, isApiErrorDetail } from "@/utils/api";
import { DEPTH_SUPPORTED_SCOPES, isPageScopeType } from "@/utils/crawler";
import {
  getUTCSchedule,
  humanizeNextDate,
  humanizeSchedule,
} from "@/utils/cron";
import { makeCurrentTargetHandler, stopProp } from "@/utils/events";
import { formValidator, maxLengthValidator } from "@/utils/form";
import localize from "@/utils/localize";
import { isArchivingDisabled } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";
import { AppStateService } from "@/utils/state";
import { regexEscape } from "@/utils/string";
import { tw } from "@/utils/tailwind";
import {
  appDefaults,
  BYTES_PER_GB,
  DEFAULT_AUTOCLICK_SELECTOR,
  DEFAULT_SELECT_LINKS,
  defaultLabel,
  defaultSeedListFileName,
  getDefaultFormState,
  getInitialFormState,
  getServerDefaults,
  makeUserGuideEvent,
  MAX_SEED_LIST_FILE_BYTES,
  MAX_SEED_LIST_STRING_BYTES,
  rangeBrowserWindows,
  SECTIONS,
  SEED_LIST_FILE_EXT,
  SeedListFormat,
  workflowTabToGuideHash,
  type FormState,
  type WorkflowDefaults,
} from "@/utils/workflow";

type CrawlConfigParams = WorkflowParams & {
  config: WorkflowParams["config"] & {
    seeds: Seed[] | null;
    seedFileId?: string | null;
  };
};
type WorkflowRunParams = { runNow: boolean; updateRunning?: boolean };

const STEPS = SECTIONS;
type StepName = (typeof STEPS)[number];
type TabState = {
  completed: boolean;
  error: boolean;
};
type Tabs = Record<StepName, TabState>;
type ProgressState = {
  activeTab: StepName;
  tabs: Tabs;
};
const DEFAULT_BEHAVIORS = [
  Behavior.AutoPlay,
  Behavior.AutoFetch,
  Behavior.SiteSpecific,
] as const;
const formName = "newJobConfig";
const panelSuffix = "--panel";
const defaultFormState = getDefaultFormState();

const pastedUrlListFileName = msg("URL List (created from paste)");

enum SubmitType {
  Save = "save",
  SaveAndRun = "run",
}

const getDefaultProgressState = (hasConfigId = false): ProgressState => {
  let activeTab: StepName = "scope";
  if (window.location.hash) {
    const hashValue = window.location.hash.slice(1);

    if (STEPS.includes(hashValue as (typeof STEPS)[number])) {
      activeTab = hashValue as StepName;
    }
  }

  return {
    activeTab,
    // TODO Mark as completed only if form section has data
    tabs: {
      scope: { error: false, completed: hasConfigId },
      limits: {
        error: false,
        completed: hasConfigId,
      },
      behaviors: {
        error: false,
        completed: hasConfigId,
      },
      browserSettings: {
        error: false,
        completed: hasConfigId,
      },
      scheduling: {
        error: false,
        completed: hasConfigId,
      },
      metadata: {
        error: false,
        completed: hasConfigId,
      },
    },
  };
};

function getLocalizedWeekDays() {
  const now = new Date();
  const { format } = new Intl.DateTimeFormat(localize.activeLanguage, {
    weekday: "short",
  });
  return Array.from({ length: 7 }).map((x, day) =>
    format(Date.now() - (now.getDay() - day) * 86400000),
  );
}

const trimArray = flow(uniq, compact);
const urlListToArray = flow(
  (str?: string) => (str?.length ? str.trim().split(/\s+/g) : []),
  trimArray,
);

//todo: make this customizable, perhaps at deploy time
const URL_LIST_MAX_URLS = 100;

type CrawlConfigResponse = {
  run_now_job?: boolean;
  started?: boolean;
  storageQuotaReached?: boolean;
  execMinutesQuotaReached?: boolean;
  quotas?: { maxPagesPerCrawl?: number };
  id?: string;
};
@customElement("btrix-workflow-editor")
@localized()
export class WorkflowEditor extends BtrixElement {
  static styles = css`
    :host {
      @keyframes sticky-footer {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    }
  `;

  @consume({ context: proxiesContext, subscribe: true })
  private readonly proxies?: ProxiesContext;

  @consume({ context: docsUrlContext })
  private readonly docsUrl?: DocsUrlContext;

  @property({ type: String })
  configId?: string;

  @property({ type: String })
  initialScopeType?: FormState["scopeType"];

  @property({ type: Object })
  initialWorkflow?: WorkflowParams;

  private updatingScopeType = false;

  @property({ type: Array })
  initialSeeds?: Seed[];

  @property({ type: Object })
  initialSeedFile?: StorageSeedFile;

  @state()
  private showCrawlerChannels = false;

  @state()
  private tagOptions: WorkflowTag[] = [];

  @state()
  private isSubmitting = false;

  @state()
  private progressState?: ProgressState;

  @state()
  private orgDefaults: WorkflowDefaults = appDefaults;

  @state()
  private formState = defaultFormState;

  @state()
  private seedFileUrlCount?: number;

  @state()
  private serverError?: TemplateResult | string;

  @state()
  private stickyFooter: "animate" | boolean = false;

  @state()
  private isCrawlRunning: boolean | null = this.configId ? null : false;

  @state()
  private showKeyboardShortcuts = false;

  private saveAndRun = false;

  // For observing panel sections position in viewport
  private readonly observable = new ObservableController(this, {
    // Add some padding to account for stickied elements
    rootMargin: "-100px 0px -100px 0px",
  });

  // For fuzzy search:
  private readonly fuse = new Fuse<WorkflowTag>([], {
    keys: ["tag"],
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private readonly seedFileReader = new FileReader();

  private readonly handleCurrentTarget = makeCurrentTargetHandler(this);
  private readonly checkFormValidity = formValidator(this);
  private readonly validateNameMax = maxLengthValidator(50);
  private readonly validateDescriptionMax = maxLengthValidator(350);

  private readonly tabLabels = sectionStrings;

  private get formHasError() {
    return (
      !this.hasRequiredFields() ||
      Object.values(this.progressState!.tabs).some(({ error }) => error)
    );
  }

  private get utcSchedule() {
    if (!this.formState.scheduleFrequency) {
      return "";
    }
    return getUTCSchedule({
      interval: this.formState.scheduleFrequency,
      dayOfMonth: this.formState.scheduleDayOfMonth,
      dayOfWeek: this.formState.scheduleDayOfWeek,
      ...this.formState.scheduleTime!,
    });
  }

  private readonly daysOfWeek = getLocalizedWeekDays();

  private readonly scheduleTypeLabels: Record<
    FormState["scheduleType"],
    string
  > = {
    date: msg("Run on a specific date and time"),
    cron: msg("Run on a recurring basis"),
    none: msg("No schedule"),
  };

  private readonly scheduleFrequencyLabels: Record<
    FormState["scheduleFrequency"],
    string
  > = {
    daily: msg("Daily"),
    weekly: msg("Weekly"),
    monthly: msg("Monthly"),
    "": "",
  };

  @query(`form[name="${formName}"]`)
  private readonly formElem?: HTMLFormElement;

  @queryAll(`.${formName}${panelSuffix}`)
  private readonly panels?: NodeListOf<HTMLElement>;

  @state()
  private readonly visiblePanels = new Set<string>();

  @queryAsync(`.${formName}${panelSuffix}--active`)
  private readonly activeTabPanel!: Promise<HTMLElement | null>;

  @query("btrix-queue-exclusion-table")
  private readonly exclusionTable?: QueueExclusionTable | null;

  @query("btrix-link-selector-table")
  private readonly linkSelectorTable?: LinkSelectorTable | null;

  @query("btrix-custom-behaviors-table")
  private readonly customBehaviorsTable?: CustomBehaviorsTable | null;

  @query("sl-textarea#seedUrlList")
  private readonly seedUrlListTextarea?: SlTextarea | null;

  // CSS parser should ideally match the parser used in browsertrix-crawler.
  // https://github.com/webrecorder/browsertrix-crawler/blob/v1.5.8/package.json#L23
  private readonly cssParser = createParser();

  connectedCallback(): void {
    this.initializeEditor();
    super.connectedCallback();

    void this.fetchOrgDefaults();
    void this.fetchTags();

    this.addEventListener(
      "btrix-intersect",
      this.onPanelIntersect as UnderlyingFunction<typeof this.onPanelIntersect>,
    );

    // Store count of seed `File`
    this.seedFileReader.onload = () => {
      if (typeof this.seedFileReader.result === "string") {
        this.seedFileUrlCount = this.seedFileReader.result
          .trim()
          .split(/\s+/g).length;
      }
    };

    this.seedFileReader.onerror = (err: unknown) => {
      console.debug("FileReader error:", err);
    };
  }

  disconnectedCallback(): void {
    this.onPanelIntersect.cancel();
    super.disconnectedCallback();
  }

  async willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.get("initialWorkflow") && this.initialWorkflow) {
      if (this.updatingScopeType) {
        this.updatingScopeType = false;
      } else {
        this.initializeEditor();
      }
    }
    if (changedProperties.has("configId")) {
      this.isCrawlRunning = this.configId ? null : false;
    }
    const prevFormState = changedProperties.get("formState") as
      | FormState
      | undefined;
    if (prevFormState) {
      if (prevFormState.seedFile !== this.formState.seedFile) {
        if (this.formState.seedFile) {
          this.seedFileReader.readAsText(this.formState.seedFile);
        } else {
          this.seedFileUrlCount = undefined;
        }
      }
    }
  }

  updated(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (
      changedProperties.has("progressState") &&
      this.progressState &&
      this.progressState.activeTab !==
        (changedProperties.get("progressState") as ProgressState | undefined)
          ?.activeTab
    ) {
      window.location.hash = this.progressState.activeTab;
    }
    const prevFormState = changedProperties.get("formState") as
      | FormState
      | undefined;
    if (prevFormState) {
      if (prevFormState.seedListFormat !== this.formState.seedListFormat) {
        void this.focusOnSeedListFormatChange();
      }
    }
  }

  private async focusOnSeedListFormatChange() {
    if (this.formState.seedListFormat === SeedListFormat.JSON) {
      if (!this.seedUrlListTextarea) {
        console.debug("missing this.seedUrlListTextarea");
        return;
      }

      await this.seedUrlListTextarea.updateComplete;
      this.seedUrlListTextarea.focus();
    }
  }

  private animateStickyFooter() {
    this.stickyFooter = "animate";
  }

  async firstUpdated() {
    // Observe form sections to get scroll position
    this.panels?.forEach((panel) => {
      this.observable.observe(panel);
    });

    if (this.progressState?.activeTab !== STEPS[0]) {
      void this.scrollToActivePanel();
    }

    // Always show footer when editing or duplicating workflow
    if (this.configId || this.hasRequiredFields()) {
      this.stickyFooter = true;
    }
  }

  private initializeEditor() {
    this.progressState = getDefaultProgressState(Boolean(this.configId));
    const formState = getInitialFormState({
      configId: this.configId,
      initialSeeds: this.initialSeeds,
      initialWorkflow: this.initialWorkflow,
      org: this.org,
    });

    if (this.initialScopeType) {
      formState.scopeType = this.initialScopeType;
    }

    this.formState = formState;
  }

  render() {
    return html`
      <form
        name="${formName}"
        @reset=${this.onReset}
        @submit=${this.onSubmit}
        @keydown=${this.onKeyDown}
        @sl-blur=${this.validateOnBlur}
        @sl-change=${this.updateFormStateOnChange}
      >
        ${pageSectionsWithNav({
          nav: this.renderNav(),
          main: this.renderFormSections(),
          sticky: true,
          stickyTopClassname: tw`lg:top-16`,
        })}
        <btrix-observable
          .options=${{
            threshold: 1,
          }}
          @btrix-intersect=${this.stickyFooter
            ? null
            : (e: IntersectEvent) => {
                const [entry] = e.detail.entries;

                if (entry.isIntersecting) {
                  this.stickyFooter = true;
                }
              }}
        >
          ${this.renderFooter()}
        </btrix-observable>
      </form>
    `;
  }

  private renderNav() {
    const button = (tab: StepName) => {
      const isActive = tab === this.progressState?.activeTab;
      return html`
        <btrix-tab-list-tab
          name=${tab}
          .active=${isActive}
          @click=${this.tabClickHandler(tab)}
        >
          ${this.tabLabels[tab]}
        </btrix-tab-list-tab>
      `;
    };

    return html`
      <btrix-tab-list
        class="mb-5 hidden lg:block"
        tab=${ifDefined(this.progressState?.activeTab)}
      >
        ${STEPS.map(button)}
      </btrix-tab-list>
    `;
  }

  private renderFormSections() {
    const activeTab = this.progressState?.activeTab;

    const panelBody = ({
      name,
      desc,
      render,
      required,
    }: (typeof this.formSections)[number]) => {
      const tabProgress = this.progressState?.tabs[name];
      const hasError = tabProgress?.error;

      return html`<sl-details
        class=${clsx(
          tw`part-[base]:rounded-lg part-[base]:border part-[base]:transition-shadow part-[base]:focus:shadow`,
          tw`part-[content]:[border-top:solid_1px_var(--sl-panel-border-color)]`,
          tw`part-[header]:text-neutral-500 part-[header]:hover:text-blue-400`,
          tw`part-[summary-icon]:[rotate:none]`,
          hasError &&
            tw`part-[header]:cursor-default part-[summary-icon]:cursor-not-allowed part-[summary-icon]:text-neutral-400`,
        )}
        ?open=${required || hasError || tabProgress?.completed}
        @sl-focus=${() => {
          if (activeTab !== name) {
            this.updateProgressState({
              activeTab: name,
            });
          }
        }}
        @sl-show=${this.handleCurrentTarget(() => {
          if (activeTab !== name) {
            this.pauseHandlePanelIntersect(name);
            this.updateProgressState({
              activeTab: name,
            });

            if (this.appState.userGuideOpen) {
              this.dispatchEvent(makeUserGuideEvent(name));
            }
          }

          track(AnalyticsTrackEvent.ExpandWorkflowFormSection, {
            section: name,
          });
        })}
        @sl-hide=${this.handleCurrentTarget((e: SlHideEvent) => {
          this.pauseHandlePanelIntersect(name);

          const el = e.currentTarget as SlDetails;

          // Check if there's any invalid elements before hiding
          let invalidEl: SlInput | null = null;

          if (required) {
            invalidEl = el.querySelector<SlInput>("[required][data-invalid]");
          }

          invalidEl =
            invalidEl || el.querySelector<SlInput>("[data-user-invalid]");

          if (invalidEl) {
            e.preventDefault();

            invalidEl.focus();
            invalidEl.checkValidity();
          }
        })}
        @sl-after-show=${this.handleCurrentTarget(
          this.resumeHandlePanelIntersect,
        )}
        @sl-after-hide=${this.handleCurrentTarget(
          this.resumeHandlePanelIntersect,
        )}
      >
        <div slot="expand-icon" class="flex items-center">
          <sl-tooltip
            content=${msg("Show section")}
            hoist
            @sl-show=${stopProp}
            @sl-hide=${stopProp}
            @sl-after-show=${stopProp}
            @sl-after-hide=${stopProp}
          >
            <sl-icon name="chevron-down" class="size-5"></sl-icon>
          </sl-tooltip>
        </div>
        <div slot="collapse-icon" class="flex items-center">
          ${when(
            hasError,
            () => html`
              <sl-tooltip
                content=${msg("Please fix all errors in this section")}
                hoist
                @sl-show=${stopProp}
                @sl-hide=${stopProp}
                @sl-after-show=${stopProp}
                @sl-after-hide=${stopProp}
              >
                <sl-icon
                  name="exclamation-lg"
                  class="size-5 text-danger"
                ></sl-icon>
              </sl-tooltip>
            `,
            () =>
              !required || this.configId
                ? html`
                    <sl-icon
                      name="chevron-up"
                      class="size-5"
                      label=${msg("Collapse section")}
                    ></sl-icon>
                  `
                : nothing,
          )}
        </div>

        <p class="text-neutral-700" slot="summary">${desc}</p>
        <div class="grid grid-cols-5 gap-5">${render.bind(this)()}</div>
      </sl-details>`;
    };

    const formSection = (section: (typeof this.formSections)[number]) => html`
      ${panel({
        id: `${section.name}${panelSuffix}`,
        className: clsx(
          `${formName}${panelSuffix}`,
          section.name === this.progressState?.activeTab &&
            `${formName}${panelSuffix}--active`,
          tw`scroll-mt-7`,
        ),
        heading: this.tabLabels[section.name],
        body: panelBody(section),
        actions: section.required
          ? html`<p class="text-xs font-normal text-neutral-500">
              ${msg(
                html`Fields marked with
                  <span style="color:var(--sl-input-required-content-color)"
                    >*</span
                  >
                  are required`,
              )}
            </p>`
          : undefined,
      })}
    `;

    return html`
      <div class="relative mb-10 flex flex-col gap-12 px-2">
        ${this.formSections.map(formSection)}
        ${when(
          this.isSubmitting,
          () =>
            // Show loading overlay to disable form on submit
            html`<sl-animation name="fadeIn" duration="150" iterations="1" play>
              <div class="absolute inset-0 z-50 bg-white/50"></div>
            </sl-animation>`,
        )}
      </div>
    `;
  }

  private renderFooter() {
    const keyboardShortcut = (key: string) => {
      const ua = navigator.userAgent;
      const metaKey = ua.includes("Mac")
        ? html`<kbd class="font-sans">⌘</kbd>`
        : html`<kbd class="font-sans">Ctrl</kbd>`;

      return html`<kbd
        class="inline-flex items-center gap-0.5 rounded-sm border border-black/20 bg-white/20 px-1 py-0.5 text-xs leading-none"
        slot="suffix"
      >
        ${metaKey}<kbd class="font-sans">${key}</kbd></kbd
      > `;
    };

    return html`
      <footer
        class=${clsx(
          tw`bottom-3 z-50 mb-7 flex items-center justify-end gap-2 rounded-lg border bg-white px-6 py-4 shadow duration-slow`,
          this.stickyFooter && [
            tw`sticky`,
            this.stickyFooter === "animate" &&
              tw`motion-safe:animate-[sticky-footer_var(--sl-transition-medium)_ease-in-out]`,
          ],
        )}
      >
        <sl-button class="mr-auto" size="small" type="reset">
          ${msg("Cancel")}
        </sl-button>

        ${when(this.serverError, (error) => this.renderErrorAlert(error))}
        ${when(this.configId, this.renderCrawlStatus)}

        <sl-tooltip content=${msg("Save without running")}>
          <sl-button
            size="small"
            type="submit"
            value=${SubmitType.Save}
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting && !this.saveAndRun}
          >
            ${msg("Save")}
            ${when(this.showKeyboardShortcuts, () => keyboardShortcut("S"))}
          </sl-button>
        </sl-tooltip>
        <sl-tooltip
          content=${this.isCrawlRunning
            ? msg("Save and apply settings to current crawl")
            : msg("Save and run with new settings")}
          ?disabled=${this.isCrawlRunning === null}
        >
          <sl-button
            size="small"
            variant="primary"
            type="submit"
            value=${SubmitType.SaveAndRun}
            ?disabled=${(!this.isCrawlRunning &&
              isArchivingDisabled(this.org, true)) ||
            this.isSubmitting ||
            this.isCrawlRunning === null}
            ?loading=${(this.isSubmitting && this.saveAndRun) ||
            this.isCrawlRunning === null}
          >
            ${this.isCrawlRunning ? msg("Update Crawl") : msg("Run Crawl")}
            ${when(this.showKeyboardShortcuts, () => keyboardShortcut("Enter"))}
          </sl-button>
        </sl-tooltip>
      </footer>
    `;
  }

  private readonly renderCrawlStatus = (workflowId: string) => {
    if (!workflowId) return;

    return html`
      <btrix-live-workflow-status
        class="mx-2"
        workflowId=${workflowId}
        @btrix-crawl-status-changed=${(
          e: CustomEvent<CrawlStatusChangedEventDetail>,
        ) => {
          this.isCrawlRunning = e.detail.isCrawlRunning;
        }}
      ></btrix-live-workflow-status>
    `;
  };

  private renderSectionHeading(content: TemplateResult | string) {
    return html`
      <btrix-section-heading class="col-span-5">
        <h4>${content}</h4>
      </btrix-section-heading>
    `;
  }

  private renderHelpTextCol(
    content: TemplateResult | string | undefined,
    padTop = true,
  ) {
    if (!content) return;

    return infoCol(content, padTop ? tw`md:pt-[2.35rem]` : tw`md:pt-1`);
  }

  private readonly renderScope = () => {
    const exclusions = trimArray(this.formState.exclusions || []);

    return html`
      ${inputCol(html`
        <sl-select
          name="scopeType"
          label=${msg("Crawl Scope")}
          value=${this.formState.scopeType}
          hoist
          @sl-change=${(e: Event) =>
            this.changeScopeType(
              (e.target as HTMLSelectElement).value as FormState["scopeType"],
            )}
        >
          <sl-menu-label>${msg("Page Crawl")}</sl-menu-label>
          <sl-option value=${ScopeType.Page}
            >${scopeTypeLabels[ScopeType.Page]}</sl-option
          >
          <sl-option value=${NewWorkflowOnlyScopeType.PageList}>
            ${scopeTypeLabels[NewWorkflowOnlyScopeType.PageList]}
          </sl-option>
          <sl-option value=${ScopeType.SPA}>
            ${scopeTypeLabels[ScopeType.SPA]}
          </sl-option>
          <sl-divider></sl-divider>
          <sl-menu-label>${msg("Site Crawl")}</sl-menu-label>
          <sl-option value=${ScopeType.Prefix}>
            ${scopeTypeLabels[ScopeType.Prefix]}
          </sl-option>
          <sl-option value=${ScopeType.Host}>
            ${scopeTypeLabels[ScopeType.Host]}
          </sl-option>
          <sl-option value=${ScopeType.Domain}>
            ${scopeTypeLabels[ScopeType.Domain]}
          </sl-option>
          <sl-option value=${ScopeType.Custom}>
            ${scopeTypeLabels[ScopeType.Custom]}
          </sl-option>
        </sl-select>
      `)}
      ${this.renderHelpTextCol(html`
        <p>${msg(`Tells the crawler which pages it can visit.`)}</p>
      `)}
      ${isPageScopeType(this.formState.scopeType)
        ? this.renderPageScope()
        : this.renderSiteScope()}
      ${!isPageScopeType(this.formState.scopeType) ||
      this.formState.includeLinkedPages
        ? html`
            <div class="col-span-5">
              <btrix-details ?open=${exclusions.length > 0}>
                <span slot="title"
                  >${msg("Exclude Pages")}
                  ${exclusions.length
                    ? html`<btrix-badge>${exclusions.length}</btrix-badge>`
                    : ""}</span
                >
                <div class="grid grid-cols-5 gap-5 py-2">
                  ${inputCol(html`
                    <btrix-queue-exclusion-table
                      label=""
                      .exclusions=${this.formState.exclusions}
                      pageSize="10"
                      editable
                      removable
                      uncontrolled
                      @btrix-remove=${this.handleRemoveRegex}
                      @btrix-change=${this.handleChangeRegex}
                    ></btrix-queue-exclusion-table>
                  `)}
                  ${this.renderHelpTextCol(infoTextFor["exclusions"], false)}
                </div>
              </btrix-details>
            </div>
          `
        : nothing}
    `;
  };

  private readonly renderPageScope = () => {
    return html`
      ${this.formState.scopeType === ScopeType.Page
        ? html`
            ${inputCol(html`
              <!-- TODO Use btrix-url-input -->
              <sl-input
                name="urlList"
                label=${msg("Page URL")}
                placeholder="https://webrecorder.net/blog"
                autocomplete="off"
                inputmode="url"
                value=${this.formState.urlList}
                autofocus
                required
                @sl-input=${async (e: Event) => {
                  const inputEl = e.target as SlInput;
                  await inputEl.updateComplete;
                  this.updateFormState(
                    {
                      urlList: inputEl.value,
                    },
                    true,
                  );
                  const valid = validURL(inputEl.value);
                  if (!inputEl.checkValidity() && valid) {
                    inputEl.setCustomValidity("");
                    inputEl.helpText = "";
                  }

                  if (valid) {
                    this.animateStickyFooter();
                  }
                }}
                @sl-blur=${async (e: Event) => {
                  const inputEl = e.target as SlInput;
                  await inputEl.updateComplete;
                  if (inputEl.value && !validURL(inputEl.value)) {
                    const text = msg("Please enter a valid URL.");
                    inputEl.helpText = text;
                    inputEl.setCustomValidity(text);
                  } else if (
                    inputEl.value &&
                    !inputEl.value.startsWith("https://") &&
                    !inputEl.value.startsWith("http://")
                  ) {
                    this.updateFormState(
                      {
                        urlList: "https://" + inputEl.value,
                      },
                      true,
                    );
                  }
                }}
              >
              </sl-input>
            `)}
            ${this.renderHelpTextCol(msg(str`The URL of the page to crawl.`))}
          `
        : this.renderUrlList()}
      ${inputCol(html`
        <sl-checkbox
          name="includeLinkedPages"
          ?checked=${this.formState.includeLinkedPages}
        >
          ${msg("Include any linked page (“one hop out”)")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        msg(`If checked, the crawler will visit pages one link away.`),
        false,
      )}
      ${when(this.formState.includeLinkedPages, () =>
        this.renderLinkSelectors(),
      )}
    `;
  };

  private renderUrlList() {
    let numberOfURLs: string | null = null;

    if (this.formState.seedListFormat === SeedListFormat.File) {
      if (this.org) {
        const { maxPagesPerCrawl } = this.org.quotas;
        if (maxPagesPerCrawl) {
          numberOfURLs = `${this.localize.number(maxPagesPerCrawl)} ${pluralOf("URLs", maxPagesPerCrawl)}`;
        }
      }
    } else {
      numberOfURLs = `${this.localize.number(URL_LIST_MAX_URLS)} ${pluralOf("URLs", URL_LIST_MAX_URLS)}`;
    }

    const jsonAdditionalInfo = msg(str`To enter more than ${numberOfURLs}`, {
      desc: "`numberOfURLs` example: '1000 URLs'",
    });
    const fileAdditionalInfo = numberOfURLs
      ? msg(
          str`The crawler will visit and record up to ${numberOfURLs} listed in the file.`,
          { desc: "`numberOfURLs` example: '1,000 URLs'" },
        )
      : msg("The crawler will visit and record each URL listed in the file.");

    return html`
      ${inputCol(html`
        <label
          class="form-label form-control-label--required"
          for="seedUrlList"
        >
          ${msg("Page URLs")}
        </label>

        <sl-radio-group
          class="mb-2.5 part-[form-control-label]:sr-only"
          label="Select how to specify URL list"
          value=${this.formState.seedListFormat}
          name="seedListFormat"
          size="small"
        >
          <sl-radio-button value=${SeedListFormat.JSON}>
            ${msg("Enter URLs")}
          </sl-radio-button>
          <sl-radio-button value=${SeedListFormat.File}>
            ${msg("Upload URL List")}
          </sl-radio-button>
        </sl-radio-group>

        ${choose(this.formState.seedListFormat, [
          [SeedListFormat.JSON, () => this.renderSeedListTextbox()],
          [SeedListFormat.File, () => this.renderSeedListFileUpload()],
        ])}
      `)}
      ${this.renderHelpTextCol(
        this.formState.seedListFormat === SeedListFormat.File
          ? html`${fileAdditionalInfo}
            ${this.renderUserGuideLink({
              hash: "page-urls",
              content: msg("Read more about URL list files"),
            })}.`
          : html`${infoTextFor["urlList"]}
              <br />
              ${jsonAdditionalInfo},
              ${this.renderUserGuideLink({
                hash: "page-urls",
                content: msg("upload a URL list file"),
              })}.`,
      )}
    `;
  }

  private readonly renderSeedListTextbox = () => {
    return html`<sl-textarea
      id="seedUrlList"
      name="urlList"
      placeholder=${`https://webrecorder.net/resources
https://archiveweb.page/guide
https://replayweb.page/docs`}
      rows="4"
      autocomplete="off"
      inputmode="url"
      value=${this.formState.urlList}
      required
      help-text=${msg("Enter one URL per line.")}
      @paste=${(e: ClipboardEvent) => {
        const text = `${(e.currentTarget as SlTextarea).value}
          ${e.clipboardData?.getData("text")}`
          // Remove zero-width characters
          .replace(/[\u200B-\u200D\uFEFF]/g, "")
          // Remove multiple whitespaces
          .replace(/\s+/g, "\n")
          .trim();

        if (text) {
          const textBlob = new Blob([text]);
          if (
            (textBlob.size > MAX_SEED_LIST_STRING_BYTES &&
              textBlob.size <= MAX_SEED_LIST_FILE_BYTES) ||
            urlListToArray(text).length > URL_LIST_MAX_URLS
          ) {
            const file = new File([textBlob], pastedUrlListFileName, {
              type: "text/plain",
            });

            this.updateFormState(
              {
                urlList: undefined,
                seedFileId: null,
                seedListFormat: SeedListFormat.File,
                seedFile: file,
              },
              true,
            );
          }
        }
      }}
      @keyup=${async (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          await (e.target as SlInput).updateComplete;
          this.doValidateUrlList(e);
        }
      }}
      @sl-input=${(e: CustomEvent) => {
        const inputEl = e.target as SlInput;
        const value = inputEl.value;

        if (value) {
          if (!this.stickyFooter) {
            const { isValid } = this.validateUrlList(inputEl.value);

            if (isValid) {
              this.animateStickyFooter();
            }
          }
        } else {
          inputEl.helpText = msg("At least 1 URL is required.");
        }
      }}
      @sl-change=${this.doValidateUrlList}
      @sl-blur=${this.doValidateUrlList}
    ></sl-textarea>`;
  };

  private readonly renderSeedListFileUpload = () => {
    const file = this.initialSeedFile;

    if (this.formState.seedFileId && file) {
      return html`<btrix-file-list>
        <btrix-file-list-item
          name=${file.originalFilename}
          size=${file.size}
          href=${file.path}
          @btrix-remove=${() => {
            this.updateFormState({
              seedFileId: null,
            });
          }}
        >
          <span slot="name" class="flex gap-1 overflow-hidden">
            <sl-tooltip content=${file.originalFilename}>
              <span class="truncate">${file.originalFilename}</span>
            </sl-tooltip>
            <span class="text-neutral-400" role="separator">&mdash;</span>
            <span class="whitespace-nowrap text-neutral-500"
              >${this.localize.number(file.seedCount)}
              ${pluralOf("URLs", file.seedCount)}</span
            >
          </span>
        </btrix-file-list-item>
      </btrix-file-list>`;
    }

    const browseFilesButton = html`<button
      class="text-primary-500 transition-colors hover:text-primary-600"
    >
      ${msg("browse files")}
    </button>`;
    const maxByteSize = this.localize.bytes(MAX_SEED_LIST_FILE_BYTES);

    let helpText: TemplateResult | null = null;
    const numberOfURLs =
      this.seedFileUrlCount &&
      `${this.localize.number(this.seedFileUrlCount)}
      ${pluralOf("URLs", this.seedFileUrlCount)}`;

    if (
      this.initialSeedFile &&
      this.initialWorkflow?.config.seedFileId &&
      !this.formState.seedFileId &&
      !this.formState.seedFile
    ) {
      // Enable undoing removing an uploaded file
      helpText = html`<sl-icon
          class="mr-0.5 align-[-.175em]"
          name="exclamation-triangle"
        ></sl-icon>
        ${msg("Uploaded URL list will be deleted.")}
        <a
          class="text-cyan-500 underline hover:no-underline"
          role="button"
          @click=${() =>
            this.updateFormState({
              seedFileId: this.initialWorkflow?.config.seedFileId,
            })}
        >
          ${msg("Undo File Removal")}
        </a>`;
    } else if (this.formState.seedFile?.name === pastedUrlListFileName) {
      helpText = html`<sl-icon
          class="mr-0.5 align-[-.175em]"
          name="info-circle"
        ></sl-icon>
        ${numberOfURLs
          ? msg(
              str`Automatically converted list of ${numberOfURLs} to a file.`,
              {
                desc: "`numberOfURLs` example: '1,000 URLs'",
              },
            )
          : msg("Automatically converted large URL list to a file.")}`;
    } else if (this.seedFileUrlCount) {
      helpText = html`${msg(str`${numberOfURLs} entered.`, {
        desc: "`numberOfURLs` example: '1,000 URLs'",
      })}`;
    }

    return html`<btrix-file-input
      id="seedUrlList"
      accept=".${SEED_LIST_FILE_EXT}"
      max=${MAX_SEED_LIST_FILE_BYTES}
      .files=${this.formState.seedFile ? [this.formState.seedFile] : null}
      drop
      openFile
      required
      @btrix-change=${(e: BtrixFileChangeEvent) => {
        this.updateFormState({
          seedFile: e.detail.value[0],
        });
      }}
      @btrix-remove=${() => {
        this.updateFormState({
          seedFile: null,
        });
      }}
    >
      <sl-icon
        name="file-earmark-arrow-up"
        class="text-xl text-cyan-400"
      ></sl-icon>
      <p class="mt-1 text-pretty text-center">
        ${msg(html`Drag file here or ${browseFilesButton}`)}
      </p>
      <div class="form-help-text text-center leading-none">
        ${msg("TXT format")},
        ${msg(str`${maxByteSize} max`, {
          desc: "`maxByteSize` example: '25 MB'. 'max' is shorthand for 'maximum'",
        })}
      </div>

      ${helpText ? html`<div slot="help-text">${helpText}</div>` : nothing}
    </btrix-file-input>`;
  };

  private readonly renderSiteScope = () => {
    const urlPlaceholder = "https://example.com/path/page.html";
    let exampleUrl = new URL(urlPlaceholder);
    if (this.formState.primarySeedUrl) {
      try {
        exampleUrl = new URL(this.formState.primarySeedUrl);
      } catch {
        /* empty */
      }
    }
    const exampleHost = exampleUrl.host;
    const exampleProtocol = exampleUrl.protocol;
    const examplePathname = exampleUrl.pathname;
    const exampleDomain = `${exampleProtocol}//${exampleHost}`;

    let helpText: TemplateResult | string;

    switch (this.formState.scopeType) {
      case ScopeType.Prefix:
        helpText = msg(
          html`Will crawl all pages and paths in the same directory, e.g.
            <span class="break-word break-word text-blue-500"
              >${exampleDomain}</span
            ><span class="break-word font-medium text-blue-500"
              >${examplePathname.slice(
                0,
                examplePathname.lastIndexOf("/"),
              )}/</span
            >`,
        );
        break;
      case ScopeType.Host:
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-500">${exampleHost}</span> and ignore pages
            on any subdomains.`,
        );
        break;
      case ScopeType.Domain:
        helpText = msg(
          html`Will crawl all pages on
            <span class="text-blue-500">${exampleHost}</span> and
            <span class="text-blue-500">subdomain.${exampleHost}</span>.`,
        );
        break;
      case ScopeType.SPA:
        helpText = msg(
          html`Will crawl hash anchor links as pages. For example,
            <span class="break-word text-blue-500"
              >${exampleDomain}${examplePathname}</span
            ><span class="break-word font-medium text-blue-500"
              >#example-page</span
            >
            will be treated as a separate page.`,
        );
        break;
      case ScopeType.Custom:
        helpText = msg(
          html`Will start with
            <span class="break-word text-blue-500"
              >${exampleDomain}${examplePathname}</span
            >
            and include <em>only</em> URLs that start with the
            <em>URL Prefixes in Scope</em> listed below.`,
        );
        break;
      default:
        helpText = "";
        break;
    }

    const additionalUrlList = urlListToArray(this.formState.urlList);
    const maxUrls = this.localize.number(URL_LIST_MAX_URLS);

    return html`
      ${inputCol(html`
        <sl-input
          name="primarySeedUrl"
          label=${msg("Crawl Start URL")}
          autocomplete="off"
          inputmode="url"
          placeholder=${urlPlaceholder}
          value=${this.formState.primarySeedUrl}
          required
          @sl-input=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            this.updateFormState(
              {
                primarySeedUrl: inputEl.value,
              },
              true,
            );
            if (!inputEl.checkValidity() && validURL(inputEl.value)) {
              inputEl.setCustomValidity("");
              inputEl.helpText = "";
            }
          }}
          @sl-blur=${async (e: Event) => {
            const inputEl = e.target as SlInput;
            await inputEl.updateComplete;
            if (inputEl.value && !validURL(inputEl.value)) {
              const text = msg("Please enter a valid URL.");
              inputEl.helpText = text;
              inputEl.setCustomValidity(text);
            } else if (
              inputEl.value &&
              !inputEl.value.startsWith("https://") &&
              !inputEl.value.startsWith("http://")
            ) {
              this.updateFormState(
                {
                  primarySeedUrl: "https://" + inputEl.value,
                },
                true,
              );
            }
            if (
              this.formState.primarySeedUrl &&
              this.formState.scopeType === ScopeType.Custom &&
              !this.formState.customIncludeUrlList
            ) {
              let prefixUrl = this.formState.primarySeedUrl;
              try {
                const startingUrl = new URL(this.formState.primarySeedUrl);
                prefixUrl =
                  startingUrl.origin +
                  startingUrl.pathname.slice(
                    0,
                    startingUrl.pathname.lastIndexOf("/") + 1,
                  );
              } catch (e) {
                // ignore
              }
              this.updateFormState(
                {
                  customIncludeUrlList: prefixUrl,
                },
                true,
              );
            }
          }}
        >
          <div slot="help-text">${helpText}</div>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(msg(`The starting point of your crawl.`))}
      ${when(
        this.formState.scopeType === ScopeType.Custom,
        () => html`
          ${inputCol(html`
            <sl-textarea
              name="customIncludeUrlList"
              label=${msg("URL Prefixes in Scope")}
              rows="3"
              autocomplete="off"
              inputmode="url"
              value=${this.formState.customIncludeUrlList}
              placeholder=${`https://example.org
https://example.net`}
              required
            ></sl-textarea>
          `)}
          ${this.renderHelpTextCol(
            msg(`Only crawl pages that begin with URLs listed here.`),
          )}
        `,
      )}
      ${when(
        DEPTH_SUPPORTED_SCOPES.includes(this.formState.scopeType),
        () => html`
          ${inputCol(html`
            <sl-input
              name="maxScopeDepth"
              label=${msg("Max Depth in Scope")}
              value=${ifDefined(
                this.formState.maxScopeDepth === null
                  ? undefined
                  : this.formState.maxScopeDepth,
              )}
              placeholder=${defaultLabel(Infinity)}
              min="0"
              type="number"
              inputmode="numeric"
            >
              <span slot="suffix">${msg("hops")}</span>
            </sl-input>
          `)}
          ${this.renderHelpTextCol(
            msg(
              `Limits how many hops away the crawler can visit while staying within the Crawl Scope.`,
            ),
          )}
        `,
      )}
      ${inputCol(html`
        <sl-checkbox
          name="includeLinkedPages"
          ?checked=${this.formState.includeLinkedPages}
        >
          ${msg("Include any linked page (“one hop out”)")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        msg(`If checked, the crawler will visit pages one link away outside of
        Crawl Scope.`),
        false,
      )}
      ${inputCol(html`
        <sl-checkbox name="useSitemap" ?checked=${this.formState.useSitemap}>
          ${msg("Check for sitemap")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `If checked, the crawler will check for a sitemap at /sitemap.xml and use it to discover pages to crawl if present.`,
        ),
        false,
      )}
      ${this.renderLinkSelectors()}

      <div class="col-span-5">
        <btrix-details>
          <span slot="title">
            ${msg("Additional Pages")}
            ${additionalUrlList.length
              ? html`<btrix-badge>${additionalUrlList.length}</btrix-badge>`
              : ""}
          </span>
          <div class="grid grid-cols-5 gap-4 py-2">
            ${inputCol(html`
              <sl-textarea
                name="urlList"
                label=${msg("Page URLs")}
                rows="3"
                autocomplete="off"
                inputmode="url"
                value=${this.formState.urlList}
                placeholder=${`https://webrecorder.net/blog
https://archiveweb.page/images/${"logo.svg"}`}
                @keyup=${async (e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    await (e.target as SlInput).updateComplete;
                    this.doValidateUrlList(e);
                  }
                }}
                @sl-input=${(e: CustomEvent) => {
                  const inputEl = e.target as SlInput;
                  if (!inputEl.value) {
                    inputEl.helpText = msg("At least 1 URL is required.");
                  }
                }}
                @sl-change=${this.doValidateUrlList}
                @sl-blur=${this.doValidateUrlList}
              ></sl-textarea>
            `)}
            ${this.renderHelpTextCol(
              html`${infoTextFor["urlList"]}
              ${msg(str`You can enter up to ${maxUrls} URLs.`, {
                desc: "`maxUrls` example: '1,000'",
              })}`,
            )}
          </div>
        </btrix-details>
      </div>
    `;
  };

  private readonly doValidateUrlList = (e: Event) => {
    const inputEl = e.target as SlInput;
    if (!inputEl.value) return;
    const { isValid, helpText } = this.validateUrlList(inputEl.value);
    inputEl.helpText = helpText;
    if (isValid) {
      inputEl.setCustomValidity("");
    } else {
      inputEl.setCustomValidity(helpText);
    }
  };

  private renderLinkSelectors() {
    const selectors = this.formState.selectLinks;
    const isCustom = !isEqual(defaultFormState.selectLinks, selectors);
    const [defaultSel, defaultAttr] =
      DEFAULT_SELECT_LINKS[0].split(SELECTOR_DELIMITER);
    const defaultValue = html`<span
      class="inline-flex items-center gap-0.5 rounded border px-1"
    >
      <btrix-code language="css" value=${defaultSel}></btrix-code
      ><code class="text-neutral-400">${SELECTOR_DELIMITER}</code
      ><btrix-code language="xml" value=${defaultAttr}></btrix-code>
    </span>`;

    return html`
      <div class="col-span-5">
        <btrix-details ?open=${isCustom}>
          <span slot="title">
            ${labelFor.selectLink}
            ${isCustom
              ? html`<btrix-badge>${selectors.length}</btrix-badge>`
              : ""}
          </span>
          <div class="grid grid-cols-5 gap-5 py-2">
            ${inputCol(
              html`<btrix-link-selector-table
                name="selectLinks"
                .selectors=${selectors}
                editable
              ></btrix-link-selector-table>`,
            )}
            ${this.renderHelpTextCol(
              html`
                ${infoTextFor["selectLinks"]}
                <br /><br />
                ${msg(
                  html`If none are specified, the crawler will default to
                  ${defaultValue}.`,
                )}
              `,
              false,
            )}
          </div>
        </btrix-details>
      </div>
    `;
  }

  private renderCrawlLimits() {
    // Max Pages minimum value cannot be lower than seed count
    const minPages = Math.max(
      1,
      urlListToArray(this.formState.urlList).length +
        (isPageScopeType(this.formState.scopeType) ? 0 : 1),
    );

    return html`
      ${inputCol(html`
        <sl-mutation-observer
          attr="min"
          @sl-mutation=${async (e: CustomEvent) => {
            // Input `min` attribute changes dynamically in response
            // to number of seed URLs. Watch for changes to `min`
            // and set validity accordingly
            const mutationRecord = e.detail.mutationList[0];
            const inputEl = mutationRecord.target as SlInput;
            await inputEl.updateComplete;
            inputEl.checkValidity();
            await inputEl.updateComplete;
            this.syncTabErrorState(inputEl);
          }}
        >
          <sl-input
            name="pageLimit"
            label=${msg("Max Pages")}
            type="number"
            inputmode="numeric"
            value=${this.formState.pageLimit || ""}
            min=${minPages}
            max=${ifDefined(
              this.orgDefaults.maxPagesPerCrawl &&
                this.orgDefaults.maxPagesPerCrawl < Infinity
                ? this.orgDefaults.maxPagesPerCrawl
                : undefined,
            )}
            placeholder=${defaultLabel(this.orgDefaults.maxPagesPerCrawl)}
            @sl-input=${this.onInputMinMax}
          >
            <span slot="suffix">${msg("pages")}</span>
          </sl-input>
        </sl-mutation-observer>
      `)}
      ${this.renderHelpTextCol(infoTextFor["pageLimit"])}
      ${inputCol(html`
        <sl-input
          name="crawlTimeoutMinutes"
          label=${msg("Crawl Time Limit")}
          value=${this.formState.crawlTimeoutMinutes || ""}
          placeholder=${defaultLabel(Infinity)}
          min="0"
          type="number"
          inputmode="numeric"
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(infoTextFor["crawlTimeoutMinutes"])}
      ${inputCol(html`
        <sl-input
          name="maxCrawlSizeGB"
          label=${msg("Crawl Size Limit")}
          value=${this.formState.maxCrawlSizeGB || ""}
          placeholder=${defaultLabel(Infinity)}
          min="0"
          type="number"
          inputmode="numeric"
        >
          <span slot="suffix">${msg("GB")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(infoTextFor["maxCrawlSizeGB"])}
    `;
  }

  private renderPageBehavior() {
    const behaviorOverrideWarning = html`
      <span slot="help-text" class="text-warning-600">
        <sl-icon
          name="exclamation-triangle"
          class="align-[-.175em] text-sm"
        ></sl-icon>
        ${msg("May be overridden by custom behaviors.")}
      </span>
    `;

    return html`
      ${this.renderSectionHeading(labelFor.behaviors)}
      ${inputCol(
        html`<sl-checkbox
          name="autoscrollBehavior"
          class="part-[form-control-help-text]:mt-1.5"
          ?checked=${this.formState.autoscrollBehavior}
        >
          ${labelFor.autoscrollBehavior}
          ${when(
            this.formState.autoscrollBehavior && this.formState.customBehavior,
            () => behaviorOverrideWarning,
          )}
        </sl-checkbox>`,
      )}
      ${this.renderHelpTextCol(
        msg(`Automatically scroll to the end of the page.`),
        false,
      )}
      ${inputCol(
        html`<sl-checkbox
            name="autoclickBehavior"
            class="part-[form-control-help-text]:mt-1.5"
            ?checked=${this.formState.autoclickBehavior}
          >
            ${labelFor.autoclickBehavior}
            ${when(
              this.formState.autoclickBehavior && this.formState.customBehavior,
              () => behaviorOverrideWarning,
            )}
          </sl-checkbox>

          ${when(
            this.formState.autoclickBehavior,
            () =>
              html`<div class="mt-3">
                <btrix-syntax-input
                  name="clickSelector"
                  label=${labelFor.clickSelector}
                  language="css"
                  value=${this.formState.clickSelector}
                  placeholder="${msg("Default:")} ${DEFAULT_AUTOCLICK_SELECTOR}"
                  disableTooltip
                  @btrix-change=${(
                    e: BtrixChangeEvent<typeof this.formState.clickSelector>,
                  ) => {
                    const el = e.target as SyntaxInput;
                    const value = e.detail.value.trim();

                    if (value) {
                      try {
                        // Validate selector
                        this.cssParser(value);

                        this.updateFormState(
                          {
                            clickSelector: e.detail.value,
                          },
                          true,
                        );
                      } catch {
                        el.setCustomValidity(
                          msg("Please enter a valid CSS selector"),
                        );
                      }
                    }
                  }}
                ></btrix-syntax-input>
              </div> `,
          )} `,
      )}
      ${this.renderHelpTextCol(
        html`
          ${msg(
            `Automatically click on all link-like elements without navigating away from the page.`,
          )}
          ${when(
            this.formState.autoclickBehavior,
            () =>
              html`<br /><br />${msg(
                  `Optionally, specify the CSS selector used to autoclick elements.`,
                )} <span class="sr-only">${msg('Defaults to "a".')}</span>`,
          )}
        `,
        false,
      )}
      ${this.renderCustomBehaviors()}
      ${this.renderSectionHeading(msg("Page Timing"))}
      ${inputCol(html`
        <sl-input
          name="pageLoadTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${labelFor.pageLoadTimeoutSeconds}
          placeholder=${defaultLabel(this.orgDefaults.pageLoadTimeoutSeconds)}
          value=${ifDefined(this.formState.pageLoadTimeoutSeconds ?? undefined)}
          min="0"
          @sl-input=${this.onInputMinMax}
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(infoTextFor["pageLoadTimeoutSeconds"])}
      ${inputCol(html`
        <sl-input
          name="postLoadDelaySeconds"
          type="number"
          inputmode="numeric"
          label=${labelFor.postLoadDelaySeconds}
          placeholder=${defaultLabel(0)}
          value=${ifDefined(this.formState.postLoadDelaySeconds ?? undefined)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(infoTextFor["postLoadDelaySeconds"])}
      ${inputCol(html`
        <sl-input
          name="behaviorTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${labelFor.behaviorTimeoutSeconds}
          placeholder=${defaultLabel(this.orgDefaults.behaviorTimeoutSeconds)}
          value=${ifDefined(this.formState.behaviorTimeoutSeconds ?? undefined)}
          min="0"
          @sl-input=${this.onInputMinMax}
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(infoTextFor["behaviorTimeoutSeconds"])}
      ${inputCol(html`
        <sl-input
          name="pageExtraDelaySeconds"
          type="number"
          inputmode="numeric"
          label=${labelFor.pageExtraDelaySeconds}
          placeholder=${defaultLabel(0)}
          value=${ifDefined(this.formState.pageExtraDelaySeconds ?? undefined)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `)}
      ${this.renderHelpTextCol(infoTextFor["pageExtraDelaySeconds"])}
    `;
  }

  private renderCustomBehaviors() {
    return html`
      ${inputCol(
        html`<sl-checkbox
            ?checked=${this.formState.customBehavior}
            @sl-change=${() =>
              this.updateFormState({
                customBehavior: !this.formState.customBehavior,
              })}
          >
            ${msg("Use Custom Behaviors")}
          </sl-checkbox>

          ${when(
            this.formState.customBehavior,
            () => html`
              <div class="mt-3">
                <btrix-custom-behaviors-table
                  .customBehaviors=${this.initialWorkflow?.config
                    .customBehaviors || []}
                  editable
                ></btrix-custom-behaviors-table>
              </div>
            `,
          )} `,
      )}
      ${this.renderHelpTextCol(infoTextFor.customBehavior, false)}
    `;
  }

  private renderBrowserSettings() {
    if (!this.formState.lang) throw new Error("missing formstate.lang");
    return html`
      ${inputCol(html`
        <btrix-select-browser-profile
          .profileId=${this.formState.browserProfile?.id}
          @on-change=${(e: SelectBrowserProfileChangeEvent) =>
            this.updateFormState({
              browserProfile: e.detail.value,
            })}
        ></btrix-select-browser-profile>
      `)}
      ${this.renderHelpTextCol(infoTextFor["browserProfile"])}
      ${this.proxies?.servers.length
        ? [
            inputCol(html`
              <btrix-select-crawler-proxy
                defaultProxyId=${ifDefined(
                  this.proxies.default_proxy_id ?? undefined,
                )}
                .proxyServers=${this.proxies.servers}
                .proxyId="${this.formState.proxyId || ""}"
                @btrix-change=${(e: SelectCrawlerProxyChangeEvent) =>
                  this.updateFormState({
                    proxyId: e.detail.value,
                  })}
              ></btrix-select-crawler-proxy>
            `),
            this.renderHelpTextCol(infoTextFor["proxyId"]),
          ]
        : nothing}
      ${inputCol(html`
        <sl-radio-group
          name="scale"
          label=${msg("Browser Windows")}
          value=${this.formState.browserWindows}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              browserWindows: +(e.target as SlCheckbox).value,
            })}
        >
          ${map(
            rangeBrowserWindows(this.appState.settings),
            (i: number) =>
              html` <sl-radio-button value="${i}" size="small"
                >${i}</sl-radio-button
              >`,
          )}
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        html`${msg(
          `Increase the number of open browser windows during a crawl. This will speed up your crawl by effectively running more crawlers at the same time.`,
        )}
        ${this.renderUserGuideLink({
          hash: "browser-windows",
          content: msg("See caveats"),
        })}.`,
      )}
      ${inputCol(html`
        <btrix-select-crawler
          .crawlerChannel=${this.formState.crawlerChannel}
          @on-change=${(e: SelectCrawlerChangeEvent) =>
            this.updateFormState({
              crawlerChannel: e.detail.value,
            })}
          @on-update=${(e: SelectCrawlerUpdateEvent) =>
            (this.showCrawlerChannels = e.detail.show)}
        ></btrix-select-crawler>
      `)}
      ${this.showCrawlerChannels
        ? this.renderHelpTextCol(infoTextFor["crawlerChannel"])
        : html``}
      ${inputCol(html`
        <sl-checkbox name="blockAds" ?checked=${this.formState.blockAds}>
          ${msg("Block ads by domain")}
        </sl-checkbox>
      `)}
      ${this.renderHelpTextCol(infoTextFor["blockAds"], false)}
      ${inputCol(html`
        <sl-input
          name="userAgent"
          label=${msg("User Agent")}
          autocomplete="off"
          placeholder=${msg("Default: Browser User Agent")}
          value=${this.formState.userAgent || ""}
        >
        </sl-input>
      `)}
      ${this.renderHelpTextCol(infoTextFor["userAgent"])}
      ${inputCol(html`
        <btrix-language-select
          .value=${this.formState.lang as LanguageCode}
          @on-change=${(e: CustomEvent) => {
            this.updateFormState({
              lang: e.detail.value,
            });
          }}
        >
          <span slot="label">${msg("Language")}</span>
        </btrix-language-select>
      `)}
      ${this.renderHelpTextCol(infoTextFor["lang"])}
    `;
  }

  private renderJobScheduling() {
    return html`
      ${inputCol(html`
        <sl-radio-group
          label=${msg("Crawl Schedule")}
          name="scheduleType"
          value=${this.formState.scheduleType}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scheduleType: (e.target as SlRadio)
                .value as FormState["scheduleType"],
            })}
        >
          <sl-radio value="none">${this.scheduleTypeLabels["none"]}</sl-radio>
          <sl-radio value="cron">${this.scheduleTypeLabels["cron"]}</sl-radio>
        </sl-radio-group>
      `)}
      ${this.renderHelpTextCol(
        msg(
          `Configure crawls to run every day, week, or month at a specified time.`,
        ),
      )}
      ${when(this.formState.scheduleType === "cron", this.renderScheduleCron)}
    `;
  }

  private readonly renderScheduleCron = () => {
    const utcSchedule = this.utcSchedule;
    return html`
      ${this.renderSectionHeading(msg("Set Schedule"))}
      ${inputCol(html`
        <sl-select
          name="scheduleFrequency"
          label=${msg("Frequency")}
          value=${this.formState.scheduleFrequency}
          @sl-change=${(e: Event) =>
            this.updateFormState({
              scheduleFrequency: (e.target as HTMLSelectElement)
                .value as FormState["scheduleFrequency"],
            })}
        >
          <sl-option value="daily"
            >${this.scheduleFrequencyLabels["daily"]}</sl-option
          >
          <sl-option value="weekly"
            >${this.scheduleFrequencyLabels["weekly"]}</sl-option
          >
          <sl-option value="monthly"
            >${this.scheduleFrequencyLabels["monthly"]}</sl-option
          >
        </sl-select>
      `)}
      ${this.renderHelpTextCol(
        msg(`Limit the frequency for how often a crawl will run.`),
      )}
      ${when(
        this.formState.scheduleFrequency === "weekly",
        () => html`
          ${inputCol(html`
            <sl-radio-group
              name="scheduleDayOfWeek"
              label=${msg("Day")}
              value=${ifDefined(this.formState.scheduleDayOfWeek)}
              @sl-change=${(e: Event) =>
                this.updateFormState({
                  scheduleDayOfWeek: +(e.target as SlRadioGroup).value,
                })}
            >
              ${this.daysOfWeek.map(
                (label, day) =>
                  html`<sl-radio-button value=${day}
                    >${label}</sl-radio-button
                  >`,
              )}
            </sl-radio-group>
          `)}
          ${this.renderHelpTextCol(
            msg(`What day of the week should a crawl run on?`),
          )}
        `,
      )}
      ${when(
        this.formState.scheduleFrequency === "monthly",
        () => html`
          ${inputCol(html`
            <sl-input
              name="scheduleDayOfMonth"
              label=${msg("Date")}
              type="number"
              inputmode="numeric"
              min="1"
              max="31"
              value=${ifDefined(this.formState.scheduleDayOfMonth)}
              required
            >
            </sl-input>
          `)}
          ${this.renderHelpTextCol(
            msg(`What day of the month should a crawl run on?`),
          )}
        `,
      )}
      ${inputCol(html`
        <btrix-time-input
          hour=${ifDefined(this.formState.scheduleTime?.hour)}
          minute=${ifDefined(this.formState.scheduleTime?.minute)}
          period=${ifDefined(this.formState.scheduleTime?.period)}
          @time-change=${(e: TimeInputChangeEvent) => {
            this.updateFormState({
              scheduleTime: e.detail,
            });
          }}
        >
          <span slot="label">${msg("Start Time")}</span>
        </btrix-time-input>
        <div class="mt-3 text-xs text-neutral-500">
          <p class="mb-1">
            ${msg(
              html`Schedule:
                <span class="text-blue-500"
                  >${utcSchedule
                    ? humanizeSchedule(utcSchedule)
                    : msg("Invalid date")}</span
                >.`,
            )}
          </p>
          <p>
            ${msg(
              html`Next scheduled run:
                <span
                  >${utcSchedule
                    ? humanizeNextDate(utcSchedule)
                    : msg("Invalid date")}</span
                >.`,
            )}
          </p>
        </div>
      `)}
      ${this.renderHelpTextCol(
        msg(`A crawl will run at this time in your current timezone.`),
      )}
    `;
  };

  private renderJobMetadata() {
    return html`
      ${inputCol(html`
        <sl-input
          class="with-max-help-text"
          name="jobName"
          label=${msg("Name")}
          autocomplete="off"
          placeholder=${msg("Our Website (example.com)")}
          value=${this.formState.jobName}
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
        ></sl-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Customize this Workflow's name. Workflows are named after
        the first Crawl URL by default.`),
      )}
      ${inputCol(html`
        <sl-textarea
          class="with-max-help-text"
          name="description"
          label=${msg("Description")}
          autocomplete="off"
          value=${ifDefined(
            this.formState.description === null
              ? undefined
              : this.formState.description,
          )}
          help-text=${this.validateDescriptionMax.helpText}
          @sl-input=${this.validateDescriptionMax.validate}
        ></sl-textarea>
      `)}
      ${this.renderHelpTextCol(msg(`Provide details about this Workflow.`))}
      ${inputCol(html`
        <btrix-tag-input
          .initialTags=${this.formState.tags}
          .tagOptions=${this.tagOptions}
          @tag-input=${this.onTagInput}
          @tags-change=${(e: TagsChangeEvent) =>
            this.updateFormState(
              {
                tags: e.detail.tags,
              },
              true,
            )}
        ></btrix-tag-input>
      `)}
      ${this.renderHelpTextCol(
        msg(`Create or assign this crawl (and its outputs) to one or more tags
        to help organize your archived items.`),
      )}
      ${inputCol(html`
        <btrix-collections-add
          .initialCollections=${this.formState.autoAddCollections}
          .configId=${this.configId}
          emptyText=${msg("Search for a Collection to auto-add crawls")}
          @collections-change=${(e: CollectionsChangeEvent) =>
            this.updateFormState(
              {
                autoAddCollections: e.detail.collections,
              },
              true,
            )}
        ></btrix-collections-add>
      `)}
      ${this.renderHelpTextCol(
        msg(`Automatically add crawls from this workflow to one or more collections
          as soon as they complete.
          Individual crawls can be selected from within the collection later.`),
      )}
    `;
  }

  private renderErrorAlert(errorMessage: string | TemplateResult) {
    return html` <div class="px-2 text-danger">${errorMessage}</div> `;
  }

  private renderUserGuideLink({
    hash,
    content,
  }: {
    hash: string;
    content: string;
  }) {
    const path = `workflow-setup#${hash}`;

    return html`<a
      href="${this.docsUrl}user-guide/${path}"
      class="text-blue-600 hover:text-blue-500"
      target="_blank"
      @click=${(e: MouseEvent) => {
        e.preventDefault();

        this.dispatchEvent(
          new CustomEvent<UserGuideEventMap["btrix-user-guide-show"]["detail"]>(
            "btrix-user-guide-show",
            {
              detail: { path },
              bubbles: true,
              composed: true,
            },
          ),
        );
      }}
      >${content}</a
    >`;
  }

  private readonly formSections: {
    name: StepName;
    desc: string;
    render: () => TemplateResult<1>;
    required?: boolean;
  }[] = [
    {
      name: "scope",
      desc: msg("Specify the range and depth of your crawl."),
      render: this.renderScope,
      required: true,
    },
    {
      name: "limits",
      desc: msg("Limit the size and duration of the crawl."),
      render: this.renderCrawlLimits,
    },
    {
      name: "behaviors",
      desc: msg("Customize how the browser loads and interacts with a page."),
      render: this.renderPageBehavior,
    },
    {
      name: "browserSettings",
      desc: msg("Configure the browser used to crawl."),
      render: this.renderBrowserSettings,
    },
    {
      name: "scheduling",
      desc: msg("Schedule recurring crawls."),
      render: this.renderJobScheduling,
    },
    {
      name: "metadata",
      desc: msg("Describe and organize crawls from this workflow."),
      render: this.renderJobMetadata,
    },
  ];

  private readonly onInputMinMax = async (e: CustomEvent) => {
    const inputEl = e.target as SlInput;
    await inputEl.updateComplete;
    let helpText = "";
    if (!inputEl.checkValidity()) {
      const value = +inputEl.value;
      const min = inputEl.min;
      const max = inputEl.max;
      if (min && value < +min) {
        helpText = msg(
          str`Must be more than minimum of ${this.localize.number(+min)}`,
        );
      } else if (max && value > +max) {
        helpText = msg(
          str`Must be less than maximum of ${this.localize.number(+max)}`,
        );
      }
    }
    inputEl.helpText = helpText;
  };

  private changeScopeType(value: FormState["scopeType"]) {
    const prevScopeType = this.formState.scopeType;
    const formState: Partial<FormState> = {
      scopeType: value,
    };
    const urls = urlListToArray(this.formState.urlList);

    const isPageScope = isPageScopeType(value);
    const isPrevPageScope = isPageScopeType(prevScopeType);

    if (isPageScope === isPrevPageScope) {
      if (isPageScope) {
        formState.urlList = urls[0];
      }
    } else {
      if (isPrevPageScope) {
        formState.primarySeedUrl = urls[0];
        formState.urlList = urls.slice(1).join("\n");
      } else if (isPageScope) {
        formState.urlList = [this.formState.primarySeedUrl, ...urls].join("\n");
      }
    }

    if (!this.configId) {
      // Remember scope type for new workflows
      this.updatingScopeType = true;
      AppStateService.partialUpdateUserPreferences({
        newWorkflowScopeType: value,
      });
    }

    this.updateFormState(formState);
  }

  // Store the panel to focus or scroll to temporarily
  // so that the intersection observer doesn't update
  // the active tab on scroll
  private scrollTargetTab: StepName | null = null;

  private pauseHandlePanelIntersect(targetActiveTab: StepName) {
    this.onPanelIntersect.flush();
    this.scrollTargetTab = targetActiveTab;
  }

  private resumeHandlePanelIntersect() {
    // Reset scroll target tab to indicate that scroll handling should continue
    this.scrollTargetTab = null;
  }

  private readonly onPanelIntersect = throttle(10)((e: Event) => {
    const { entries } = (e as IntersectEvent).detail;

    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        this.visiblePanels.add(entry.target.id);
      } else {
        this.visiblePanels.delete(entry.target.id);
      }
    });

    if (!this.scrollTargetTab) {
      // Make first visible tab active
      const panels = [...(this.panels ?? [])];
      const targetActiveTab = panels
        .find((panel) => this.visiblePanels.has(panel.id))
        ?.id.split(panelSuffix)[0] as StepName | undefined;

      if (!targetActiveTab || !STEPS.includes(targetActiveTab)) {
        if (targetActiveTab) {
          console.debug(
            "tab not in steps:",
            targetActiveTab,
            this.visiblePanels,
          );
        }

        return;
      }

      this.updateProgressState({ activeTab: targetActiveTab });
    }
  });

  private hasRequiredFields(): boolean {
    if (isPageScopeType(this.formState.scopeType)) {
      return Boolean(
        this.formState.seedListFormat === SeedListFormat.File
          ? this.formState.seedFile || this.formState.seedFileId
          : this.formState.urlList,
      );
    }

    return Boolean(this.formState.primarySeedUrl);
  }

  private async scrollToActivePanel() {
    const activeTabPanel = await this.activeTabPanel;
    if (!activeTabPanel) {
      console.debug("no activeTabPanel");
      return;
    }

    if (this.progressState?.activeTab) {
      this.pauseHandlePanelIntersect(this.progressState.activeTab);
    }

    // Focus on focusable element, if found, to highlight the section
    const details = activeTabPanel.querySelector("sl-details")!;
    const summary = details.shadowRoot?.querySelector<HTMLElement>(
      "summary[aria-controls]",
    );

    activeTabPanel.scrollIntoView({ block: "start" });

    if (summary) {
      summary.focus({
        // Handle scrolling into view separately
        preventScroll: true,
        // Prevent firefox from applying own focus styles
        focusVisible: false,
      } as FocusOptions & {
        focusVisible: boolean;
      });
    } else {
      console.debug("summary not found in sl-details");
    }

    if (details.open) {
      this.resumeHandlePanelIntersect();
    } else {
      void details.show();
    }
  }

  private async handleRemoveRegex(e: CustomEvent) {
    const table = e.target as QueueExclusionTable;
    const { exclusions } = table;

    if (!this.formState.exclusions) {
      this.updateFormState(
        {
          exclusions: this.formState.exclusions,
        },
        true,
      );
    } else {
      this.updateFormState({ exclusions }, true);
    }

    this.updateExclusionsValidity();

    await this.updateComplete;
    await this.exclusionTable?.updateComplete;

    // Update tab error state if an invalid regex was removed
    if (e.detail.valid === false && table.checkValidity()) {
      this.syncTabErrorState(table);
    }
  }

  private async handleChangeRegex(e: ExclusionChangeEvent) {
    const table = e.target as QueueExclusionTable;
    const { exclusions } = table;

    this.updateFormState({ exclusions }, true);
    this.updateExclusionsValidity();

    await this.updateComplete;
    await this.exclusionTable?.updateComplete;

    if (e.detail.valid === false || !table.checkValidity()) {
      this.updateProgressState({
        tabs: {
          scope: { error: true },
        },
      });
    } else {
      this.syncTabErrorState(table);
    }
  }

  /**
   * HACK Set data attribute manually so that
   * exclusions table works with `syncTabErrorState`
   *
   * FIXME Should be fixed with
   * https://github.com/webrecorder/browsertrix/issues/2497
   */
  private updateExclusionsValidity() {
    if (this.exclusionTable?.checkValidity() === false) {
      this.exclusionTable.setAttribute("data-invalid", "true");
      this.exclusionTable.setAttribute("data-user-invalid", "true");
    } else {
      this.exclusionTable?.removeAttribute("data-invalid");
      this.exclusionTable?.removeAttribute("data-user-invalid");
    }
  }

  private readonly validateOnBlur = async (e: Event) => {
    const el = e.target as LitElement;
    const tagName = el.tagName.toLowerCase();
    if (
      !["sl-input", "sl-textarea", "sl-select", "sl-checkbox"].includes(
        tagName,
      ) &&
      !("value" in el)
    ) {
      return;
    }
    await el.updateComplete;
    await this.updateComplete;

    const panelEl = el.closest<HTMLElement>(`.${formName}${panelSuffix}`);

    if (!panelEl) {
      return;
    }

    const currentTab = panelEl.id.split(panelSuffix)[0] as StepName;

    // Check [data-user-invalid] to validate only touched inputs
    if ("userInvalid" in el.dataset) {
      if (this.progressState!.tabs[currentTab].error) return;
      this.updateProgressState({
        tabs: {
          [currentTab]: { error: true },
        },
      });
    } else if (this.progressState!.tabs[currentTab].error) {
      this.syncTabErrorState(el);
    }
  };

  private syncTabErrorState(el: LitElement) {
    const panelEl = el.closest<HTMLElement>(`.${formName}${panelSuffix}`);

    if (!panelEl) {
      console.debug("no panel for element:", el);
      return;
    }

    const tabName = panelEl.id.split(panelSuffix)[0] as StepName;
    const hasInvalid = panelEl.querySelector("[data-user-invalid]");

    if (!hasInvalid && this.progressState!.tabs[tabName].error) {
      this.updateProgressState({
        tabs: {
          [tabName]: { error: false },
        },
      });
    } else if (hasInvalid && !this.progressState!.tabs[tabName].error) {
      this.updateProgressState({
        tabs: {
          [tabName]: { error: true },
        },
      });
    }
  }

  private updateFormStateOnChange(e: Event) {
    const elem = e.target as SlTextarea | SlInput | SlCheckbox | SlRadioGroup;
    const name = elem.name;
    if (!Object.prototype.hasOwnProperty.call(this.formState, name)) {
      return;
    }
    const tagName = elem.tagName.toLowerCase();
    let value: boolean | string | null | number;
    switch (tagName) {
      case "sl-checkbox":
        value = (elem as SlCheckbox).checked;
        break;
      case "sl-textarea":
      case "sl-radio-group":
        value = elem.value;
        break;
      case "sl-input": {
        if ((elem as SlInput).type === "number") {
          if (elem.value === "") {
            value = null;
          } else {
            value = +elem.value;
          }
        } else {
          value = elem.value;
        }
        break;
      }
      default:
        return;
    }
    this.updateFormState({
      [name]: value,
    });
  }

  private readonly tabClickHandler =
    (step: StepName) => async (e: MouseEvent) => {
      const tab = e.currentTarget as TabListTab;
      if (tab.disabled || tab.active) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      this.updateProgressState({ activeTab: step });

      await this.updateComplete;

      void this.scrollToActivePanel();

      if (this.appState.userGuideOpen) {
        this.dispatchEvent(
          new CustomEvent<UserGuideEventMap["btrix-user-guide-show"]["detail"]>(
            "btrix-user-guide-show",
            {
              detail: {
                path: `workflow-setup/#${workflowTabToGuideHash[step]}`,
              },
              bubbles: true,
              composed: true,
            },
          ),
        );
      }
    };

  private onKeyDown(event: KeyboardEvent) {
    const { key, metaKey } = event;

    if (metaKey && !this.showKeyboardShortcuts) {
      // Show meta keyboard shortcut
      this.showKeyboardShortcuts = true;
      this.animateStickyFooter();
    }

    const el = event.target as HTMLElement;
    if (!("value" in el)) return;

    if (metaKey) {
      if (key === "s" || key === "Enter") {
        event.preventDefault();

        this.saveAndRun = key === "Enter";

        // Trigger blur to run value transformations and validation
        el.addEventListener(
          "sl-blur",
          async (e: SlBlurEvent) => {
            const input = e.currentTarget as SlInput;

            // Wait for all transformations and validations to run
            await input.updateComplete;
            await this.updateComplete;

            this.formElem?.requestSubmit();
          },
          { once: true },
        );

        el.blur();

        return;
      }
    }

    if ((el as unknown as SlInput).type === "number") {
      // Prevent typing non-numeric keys
      if (!metaKey && !event.shiftKey && key.length === 1 && /\D/.test(key)) {
        event.preventDefault();
        return;
      }
    }

    if (
      key === "Enter" &&
      this.progressState!.activeTab !== STEPS[STEPS.length - 1] &&
      // Prevent places where Enter is valid from being stopped
      !["TEXTAREA", "SL-TEXTAREA"].includes(el.tagName)
    ) {
      // Prevent submission by "Enter" keypress if not on last tab
      event.preventDefault();
    }
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();

    // Submitter may not exist if requesting submit from keyboard shortcuts
    if (event.submitter) {
      const submitType = (
        event.submitter as HTMLButtonElement & {
          value?: SubmitType;
        }
      ).value;

      this.saveAndRun = submitType === SubmitType.SaveAndRun;
    }

    if (!this.formElem) return;

    // Wait for custom behaviors validation to finish
    // TODO Move away from manual validation check
    // See https://github.com/webrecorder/browsertrix/issues/2536

    if (this.formState.customBehavior && this.customBehaviorsTable) {
      if (!this.customBehaviorsTable.checkValidity()) {
        this.customBehaviorsTable.reportValidity();
        return;
      }

      try {
        await this.customBehaviorsTable.taskComplete;
      } catch {
        this.customBehaviorsTable.reportValidity();
        return;
      }
    }

    const isValid = await this.checkFormValidity(this.formElem);

    if (!isValid || this.formHasError) {
      this.formElem.reportValidity();
      return;
    }

    this.isSubmitting = true;

    const uploadParams: Parameters<WorkflowEditor["parseConfig"]>[0] = {};

    // Upload seed file first if it exists, since ID will be used to
    // create/update the workflow
    if (
      this.formState.seedListFormat === SeedListFormat.File &&
      this.formState.seedFile
    ) {
      try {
        uploadParams.seedFileId = await this.uploadSeedFile();
      } catch {
        return;
      }
    }

    const config: CrawlConfigParams & WorkflowRunParams = {
      ...this.parseConfig(uploadParams),
      runNow: this.saveAndRun && !this.isCrawlRunning,
    };

    if (this.configId) {
      config.updateRunning = this.saveAndRun && Boolean(this.isCrawlRunning);
    }

    try {
      const data = await (this.configId
        ? this.api.fetch<CrawlConfigResponse>(
            `/orgs/${this.orgId}/crawlconfigs/${this.configId}`,
            {
              method: "PATCH",
              body: JSON.stringify(config),
            },
          )
        : this.api.fetch<CrawlConfigResponse>(
            `/orgs/${this.orgId}/crawlconfigs/`,
            {
              method: "POST",
              body: JSON.stringify(config),
            },
          ));

      const crawlId = data.run_now_job || data.started || null;
      const storageQuotaReached = data.storageQuotaReached;
      const executionMinutesQuotaReached = data.execMinutesQuotaReached;

      let message = msg("Workflow created.");
      if (crawlId) {
        message = msg("Crawl started with new workflow settings.");
      } else if (this.configId) {
        message = msg("Workflow updated.");
      }

      this.notify.toast({
        message,
        variant: "success",
        icon: "check2-circle",
        id: "workflow-created-status",
      });

      this.navigate.to(
        `${this.navigate.orgBasePath}/workflows/${this.configId || data.id}/${
          crawlId && !storageQuotaReached && !executionMinutesQuotaReached
            ? WorkflowTab.LatestCrawl
            : WorkflowTab.Settings
        }`,
      );
    } catch (e) {
      if (isApiError(e)) {
        if (e.details === "crawl_already_running") {
          this.notify.toast({
            title: msg("Workflow saved without starting crawl."),
            message: msg(
              "Could not run crawl with new workflow settings due to already running crawl.",
            ),
            variant: "warning",
            icon: "exclamation-circle",
            duration: 12000,
            id: "workflow-created-status",
          });
        } else {
          // TODO Handle field errors more consistently
          // https://github.com/webrecorder/browsertrix/issues/2512
          this.notify.toast({
            message: msg("Please fix all errors and try again."),
            variant: "danger",
            icon: "exclamation-octagon",
            id: "workflow-created-status",
          });

          const errorDetail = Array.isArray(e.details)
            ? e.details[0]
            : e.details;

          if (typeof errorDetail === "string") {
            let errorDetailMessage = errorDetail.replace(/_/g, " ");

            if (isApiErrorDetail(errorDetail)) {
              switch (errorDetail) {
                case APIErrorDetail.InvalidLinkSelector:
                  errorDetailMessage = msg(
                    "Page link selectors contain invalid selector or attribute",
                  );
                  break;
                case APIErrorDetail.InvalidRegex:
                  errorDetailMessage = msg(
                    "Page exclusion contains invalid regex",
                  );
                  break;
                case APIErrorDetail.InvalidLang:
                  errorDetailMessage = msg("Invalid language code");
                  break;
                case APIErrorDetail.UseOneOfSeedsOrSeedFile:
                  errorDetailMessage = msg(
                    "Remove URL list file, or delete entered URLs",
                  );
                  break;
                default:
                  break;
              }
            }

            this.serverError = `${msg("Please fix the following issue:")} ${errorDetailMessage}`;
          }
        }
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't save workflow at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "workflow-created-status",
        });
      }
    }

    this.isSubmitting = false;
  }

  private async uploadSeedFile() {
    const { seedFile } = this.formState;

    if (!seedFile) {
      this.notify.toast({
        message: msg("Please choose a valid URL list file."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "workflow-created-status",
      });

      return;
    }

    try {
      const params = queryString.stringify({
        filename:
          seedFile.name === pastedUrlListFileName
            ? defaultSeedListFileName()
            : seedFile.name,
      });
      const data = await this.api.upload(
        `/orgs/${this.orgId}/files/seedFile?${params}`,
        seedFile,
      );

      return data.id;
    } catch (err) {
      if (isApiError(err)) {
        console.debug(err.details);
      }

      this.notify.toast({
        message: msg(
          "Uploading URL list file failed. Please choose another file and try again.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "workflow-created-status",
      });
    }
  }

  private async onReset() {
    this.navigate.to(
      `${this.navigate.orgBasePath}/workflows${this.configId ? `/${this.configId}/${WorkflowTab.Settings}` : ""}`,
    );
    // this.initializeEditor();
  }

  private validateUrlList(
    value: string,
    max = URL_LIST_MAX_URLS,
  ): { isValid: boolean; helpText: string } {
    const maxUrls = this.localize.number(max);
    const urlList = urlListToArray(value);
    let isValid = true;
    let helpText = `${this.localize.number(urlList.length)} ${pluralOf("URLs", urlList.length)} ${msg("entered")}`;
    if (urlList.length > max) {
      isValid = false;
      helpText = `${msg("This list is too large.")} ${msg(
        str`Please shorten list to ${maxUrls} or fewer URLs or upload the list as a file.`,
      )}`;
    } else {
      const invalidUrl = urlList.find((url) => !validURL(url));
      if (invalidUrl) {
        isValid = false;
        helpText = msg(
          str`Please remove or fix the following invalid URL: ${invalidUrl}`,
        );
      }
      if (isValid) {
        // auto-add https:// prefix if otherwise a valid URL
        let updated = false;
        for (let i = 0; i < urlList.length; i++) {
          const url = urlList[i];
          if (!url.startsWith("http://") && !url.startsWith("https://")) {
            urlList[i] = "https://" + url;
            updated = true;
          }
        }
        if (updated) {
          this.updateFormState({ urlList: urlList.join("\n") });
        }
      }
    }
    return { isValid, helpText };
  }

  private readonly onTagInput = (e: TagInputEvent) => {
    const { value } = e.detail;
    if (!value) return;
    this.tagOptions = this.fuse.search(value).map(({ item }) => item);
  };

  private async fetchTags() {
    this.tagOptions = [];
    try {
      const { tags } = await this.api.fetch<WorkflowTags>(
        `/orgs/${this.orgId}/crawlconfigs/tagCounts`,
      );

      // Update search/filter collection
      this.fuse.setCollection(tags);
    } catch (e) {
      // Fail silently, since users can still enter tags
      console.debug(e);
    }
  }

  private parseConfig(uploadParams?: {
    seedFileId?: string;
  }): CrawlConfigParams {
    const config: CrawlConfigParams = {
      // Job types are now merged into a single type
      jobType: "custom",
      name: this.formState.jobName || "",
      description: this.formState.description,
      browserWindows: this.formState.browserWindows,
      profileid: this.formState.browserProfile?.id || "",
      schedule: this.formState.scheduleType === "cron" ? this.utcSchedule : "",
      crawlTimeout: this.formState.crawlTimeoutMinutes * 60,
      maxCrawlSize: this.formState.maxCrawlSizeGB * BYTES_PER_GB,
      tags: this.formState.tags,
      autoAddCollections: this.formState.autoAddCollections,
      config: {
        ...(isPageScopeType(this.formState.scopeType)
          ? this.parseUrlListConfig(uploadParams)
          : this.parseSeededConfig()),
        behaviorTimeout: this.formState.behaviorTimeoutSeconds,
        pageLoadTimeout: this.formState.pageLoadTimeoutSeconds,
        pageExtraDelay: this.formState.pageExtraDelaySeconds,
        postLoadDelay: this.formState.postLoadDelaySeconds,
        userAgent: this.formState.userAgent,
        limit: this.formState.pageLimit,
        lang: this.formState.lang || "",
        blockAds: this.formState.blockAds,
        exclude: trimArray(this.formState.exclusions),
        behaviors: this.setBehaviors(),
        selectLinks: this.linkSelectorTable?.value.length
          ? this.linkSelectorTable.value
          : DEFAULT_SELECT_LINKS,
        customBehaviors:
          (this.formState.customBehavior && this.customBehaviorsTable?.value) ||
          [],
        clickSelector:
          this.formState.clickSelector || DEFAULT_AUTOCLICK_SELECTOR,
      },
      crawlerChannel: this.formState.crawlerChannel || "default",
      proxyId: this.formState.proxyId,
    };

    return config;
  }

  private setBehaviors(): string {
    const behaviors: Behavior[] = [...DEFAULT_BEHAVIORS];

    if (this.formState.autoscrollBehavior) {
      behaviors.unshift(Behavior.AutoScroll);
    }

    if (this.formState.autoclickBehavior) {
      behaviors.push(Behavior.AutoClick);
    }

    return behaviors.join(",");
  }

  private parseUrlListConfig(uploadParams?: {
    seedFileId?: string;
  }): Pick<
    CrawlConfigParams["config"],
    | "seeds"
    | "seedFileId"
    | "scopeType"
    | "extraHops"
    | "useSitemap"
    | "failOnFailedSeed"
  > {
    const jsonSeeds = this.formState.seedListFormat === SeedListFormat.JSON;

    const config = {
      seeds: jsonSeeds
        ? urlListToArray(this.formState.urlList).map((seedUrl) => {
            const newSeed: Seed = { url: seedUrl, scopeType: ScopeType.Page };
            return newSeed;
          })
        : null,
      seedFileId: jsonSeeds
        ? null
        : uploadParams?.seedFileId ?? this.formState.seedFileId,
      scopeType: ScopeType.Page,
      extraHops: this.formState.includeLinkedPages ? 1 : 0,
      useSitemap: false,
      failOnFailedSeed: this.formState.failOnFailedSeed,
    };

    return config;
  }

  private parseSeededConfig(): Pick<
    CrawlConfigParams["config"],
    "seeds" | "scopeType" | "useSitemap" | "failOnFailedSeed"
  > {
    const primarySeedUrl = this.formState.primarySeedUrl;
    const includeUrlList = this.formState.customIncludeUrlList
      ? urlListToArray(this.formState.customIncludeUrlList)
      : [];
    const additionalSeedUrlList = this.formState.urlList
      ? urlListToArray(this.formState.urlList).map((seedUrl) => {
          const newSeed: Seed = { url: seedUrl, scopeType: ScopeType.Page };
          return newSeed;
        })
      : [];
    const primarySeed: Seed = {
      url: primarySeedUrl,
      scopeType: this.formState.scopeType as ScopeType,
      include:
        this.formState.scopeType === ScopeType.Custom
          ? [...includeUrlList.map((url) => "^" + regexEscape(url))]
          : [],
      extraHops: this.formState.includeLinkedPages ? 1 : 0,
    };

    if (DEPTH_SUPPORTED_SCOPES.includes(this.formState.scopeType)) {
      primarySeed.depth = this.formState.maxScopeDepth;
    }

    const config = {
      seeds: [primarySeed, ...additionalSeedUrlList],
      scopeType: this.formState.scopeType as ScopeType,
      useSitemap: this.formState.useSitemap,
      failOnFailedSeed: false,
    };
    return config;
  }

  private updateProgressState(
    nextState: {
      activeTab?: ProgressState["activeTab"];
      tabs?: {
        [K in StepName]?: Partial<TabState>;
      };
    },
    shallowMerge = false,
  ) {
    if (shallowMerge) {
      this.progressState = {
        ...this.progressState!,
        ...(nextState as Partial<ProgressState>),
      };
    } else {
      this.progressState = mergeDeep(this.progressState, nextState);
    }
  }

  private updateFormState(nextState: Partial<FormState>, shallowMerge = false) {
    if (shallowMerge) {
      this.formState = {
        ...this.formState,
        ...nextState,
      };
    } else {
      this.formState = mergeDeep(this.formState, nextState);
    }
  }

  // TODO Consolidate with config-details
  private async fetchOrgDefaults() {
    try {
      const [serverDefaults, { quotas }] = await Promise.all([
        getServerDefaults(),
        this.api.fetch<{
          quotas: { maxPagesPerCrawl?: number };
        }>(`/orgs/${this.orgId}`),
      ]);

      const defaults = {
        ...this.orgDefaults,
        ...serverDefaults,
      };

      if (defaults.maxPagesPerCrawl && quotas.maxPagesPerCrawl) {
        defaults.maxPagesPerCrawl = Math.min(
          defaults.maxPagesPerCrawl,
          quotas.maxPagesPerCrawl,
        );
      }

      this.orgDefaults = defaults;
    } catch (e) {
      console.debug(e);
    }
  }
}
