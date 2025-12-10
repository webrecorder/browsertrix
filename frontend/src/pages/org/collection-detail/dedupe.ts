import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlChangeEvent, SlRadioGroup } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { emptyMessage } from "@/layouts/emptyMessage";
import { panel, panelBody } from "@/layouts/panel";
import { OrgTab } from "@/routes";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Collection } from "@/types/collection";
import type { Crawl, Workflow } from "@/types/crawler";
import { SortDirection } from "@/types/utils";

const INITIAL_PAGE_SIZE = 10;

enum CrawlsView {
  Workflows = "workflows",
  Crawls = "crawls",
}

const DEFAULT_CRAWLS_VIEW = CrawlsView.Workflows;

type View = {
  crawlsView?: CrawlsView;
};

@customElement("btrix-collection-detail-dedupe")
@localized()
export class CollectionDetailDedupe extends BtrixElement {
  @property({ type: String })
  collectionId = "";

  @property({ type: Object })
  collection?: Collection;

  @state()
  private pagination: Required<APIPaginationQuery> = {
    page: parsePage(new URLSearchParams(location.search).get("page")),
    pageSize: INITIAL_PAGE_SIZE,
  };

  private readonly view = new SearchParamsValue<View>(
    this,
    (value, params) => {
      if (value.crawlsView) {
        params.set("crawlsView", value.crawlsView);
      } else {
        params.delete("crawlsView");
      }
      return params;
    },
    (params) => {
      const crawlsView = params.get("crawlsView");
      return {
        crawlsView: crawlsView
          ? (crawlsView as CrawlsView)
          : DEFAULT_CRAWLS_VIEW,
      };
    },
  );

  private readonly dedupeWorkflowsTask = new Task(this, {
    task: async ([collectionId], { signal }) => {
      if (!collectionId) return;

      const query = queryString.stringify({
        dedupeCollId: collectionId,
        sortBy: "name",
      });

      return this.api.fetch<APIPaginatedList<Workflow>>(
        `/orgs/${this.orgId}/crawlconfigs?${query}`,
        { signal },
      );
    },
    args: () => [this.collectionId] as const,
  });

  private readonly dedupeCrawlsTask = new Task(this, {
    task: async ([collectionId, pagination], { signal }) => {
      if (!collectionId) return;

      const query = queryString.stringify({
        ...pagination,
        dedupeCollId: collectionId,
        sortBy: "finished",
        sortDirection: SortDirection.Descending,
      });

      return this.api.fetch<APIPaginatedList<Crawl>>(
        `/orgs/${this.orgId}/crawls?${query}`,
        { signal },
      );
    },
    args: () => [this.collectionId, this.pagination] as const,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("view.internalValue")) {
      this.pagination = {
        ...this.pagination,
        page: 1,
      };
    }
  }

  render() {
    if (!this.collection) return;

    if (this.collection.hasDedupeIndex) {
      return html`
        <div
          class="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-neutral-50 p-3"
        >
          <div class="flex items-center gap-2">
            <label for="view" class="whitespace-nowrap text-neutral-500"
              >${msg("View:")}</label
            >
            <sl-radio-group
              id="view"
              size="small"
              value=${this.view.value.crawlsView || DEFAULT_CRAWLS_VIEW}
              @sl-change=${(e: SlChangeEvent) => {
                this.view.setValue({
                  crawlsView: (e.target as SlRadioGroup).value as CrawlsView,
                });
              }}
            >
              <sl-radio-button pill value=${DEFAULT_CRAWLS_VIEW}>
                ${msg("Crawl Workflows")}
              </sl-radio-button>
              <sl-radio-button pill value=${CrawlsView.Crawls}>
                ${msg("Indexed Crawls")}
              </sl-radio-button>
            </sl-radio-group>
          </div>
        </div>

        <div class="mx-2">
          ${choose(this.view.value.crawlsView, [
            [CrawlsView.Workflows, this.renderDedupeWorkflows],
            [CrawlsView.Crawls, this.renderDedupeCrawls],
          ])}
        </div>
      `;
    }

    return panelBody({
      content: emptyMessage({
        message: msg("Deduplication is not enabled"),
        detail: msg(
          "Deduplication can help recover storage space and reduce crawl time.",
        ),
        actions: html`
          <sl-button
            size="small"
            href="${this.navigate.orgBasePath}/${OrgTab.Workflows}"
            @click=${this.navigate.link}
          >
            <sl-icon slot="prefix" name="file-code-fill"></sl-icon>
            ${msg("Enable in Workflows")}
          </sl-button>
        `,
      }),
    });
  }

  private readonly renderDedupeCrawls = () => {
    const loading = () => html`
      <sl-skeleton effect="sheen" class="h-9"></sl-skeleton>
    `;
    const crawls = (crawls?: APIPaginatedList<Crawl>) =>
      crawls?.items.length
        ? html`
            <div class="overflow-hidden rounded border">
              <btrix-item-dependency-tree
                .items=${crawls.items}
                collectionId=${this.collectionId}
              ></btrix-item-dependency-tree>
            </div>

            <footer class="mt-6 flex justify-center">
              <btrix-pagination
                page=${crawls.page}
                totalCount=${crawls.total}
                size=${crawls.pageSize}
                @page-change=${async (e: PageChangeEvent) => {
                  this.pagination = {
                    ...this.pagination,
                    page: e.detail.page,
                  };

                  await this.dedupeCrawlsTask.taskComplete;

                  // Scroll to top of list
                  // TODO once deep-linking is implemented, scroll to top of pushstate
                  this.scrollIntoView({ behavior: "smooth" });
                }}
              ></btrix-pagination>
            </footer>
          `
        : panelBody({
            content: emptyMessage({
              message: msg("No crawls found."),
            }),
          });

    return html`${this.dedupeCrawlsTask.render({
      initial: loading,
      pending: () =>
        this.dedupeCrawlsTask.value
          ? crawls(this.dedupeCrawlsTask.value)
          : loading(),
      complete: crawls,
    })}`;
  };

  private readonly renderDedupeWorkflows = () => {
    const loading = () =>
      html`<sl-skeleton effect="sheen" class="h-10"></sl-skeleton>`;
    return html`${this.dedupeWorkflowsTask.render({
      initial: loading,
      pending: loading,
      complete: (workflows) =>
        workflows?.items.length
          ? html`
              <btrix-dedupe-workflows
                .workflows=${workflows.items}
              ></btrix-dedupe-workflows>
            `
          : panelBody({
              content: emptyMessage({
                message: msg("No crawls added."),
              }),
            }),
    })}`;
  };

  private renderDedupeOverview() {
    return panel({
      heading: msg("Overview"),
      body: html`<btrix-desc-list>
        <btrix-desc-list-item label=${msg("Dedupe Status")}>
          ${this.collection?.hasDedupeIndex ? msg("Enabled") : msg("Disabled")}
        </btrix-desc-list-item>

        ${
          /**
          <btrix-desc-list-item label=${msg("Total Indexed URLs")}>
            ${this.localize.number(
              // TODO
              0,
            )}
            ${pluralOf(
              "URLs",
              // TODO
              0,
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Dedupe Index Size")}>
            ${this.localize.bytes(
              // TODO
              0,
            )}
          </btrix-desc-list-item>
          */ ""
        }
      </btrix-desc-list>`,
    });
  }
}
