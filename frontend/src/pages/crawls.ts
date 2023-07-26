import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import queryString from "query-string";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import type { Crawl, CrawlState } from "../types/crawler";
import type { APIPaginationQuery, APIPaginatedList } from "../types/api";
import { ROUTES } from "../routes";
import "./org/workflow-detail";
import "./org/crawls-list";
import { PropertyValueMap } from "lit";

@needLogin
@localized()
export class Crawls extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  crawlId?: string;

  @state()
  private crawl?: Crawl;

  @state()
  private crawls?: APIPaginatedList;

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("crawlId") && this.crawlId) {
      this.fetchWorkflowId();
    }
  }

  protected firstUpdated(): void {
    this.fetchCrawls();
  }

  render() {
    return html` <div
      class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border"
    >
      ${this.crawlId ? this.renderDetail() : this.renderList()}
    </div>`;
  }

  private renderDetail() {
    if (!this.crawl) return;

    return html`
      <btrix-workflow-detail
        .authState=${this.authState!}
        orgId=${this.crawl.oid}
        workflowId=${this.crawl.cid}
        initialActivePanel="watch"
        isCrawler
      ></btrix-workflow-detail>
    `;
  }

  private renderList() {
    if (!this.crawls) return;

    return html`
      <btrix-crawl-list baseUrl=${"/crawls/crawl"} artifactType="crawl">
        ${this.crawls.items.map(this.renderCrawlItem)}
      </btrix-crawl-list>
    `;
    // return html`<btrix-crawls-list
    //   .authState=${this.authState}
    //   crawlsBaseUrl=${ROUTES.crawls}
    //   crawlsAPIBaseUrl="/orgs/all/crawls"
    //   artifactType="crawl"
    //   isCrawler
    //   isAdminView
    //   shouldFetch
    // ></btrix-crawls-list>`;
  }

  private renderCrawlItem = (crawl: Crawl) =>
    html`
      <btrix-crawl-list-item .crawl=${crawl}>
        <sl-menu slot="menu">
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `/orgs/${crawl.oid}/artifacts/${
                  crawl.type === "upload" ? "upload" : "crawl"
                }/${crawl.id}`
              )}
          >
            ${msg("View Crawl Details")}
          </sl-menu-item>
        </sl-menu>
      </btrix-crawl-list-item>
    `;

  private async fetchWorkflowId() {
    try {
      this.crawl = await this.getCrawl();
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Fetch crawls and update internal state
   */
  private async fetchCrawls(params?: APIPaginationQuery): Promise<void> {
    try {
      this.crawls = await this.getCrawls({
        ...params,
      });
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawls at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
  private async getCrawls(
    queryParams?: APIPaginationQuery & { state?: CrawlState[] }
  ): Promise<APIPaginatedList> {
    const query = queryString.stringify(
      {
        ...queryParams,
      },
      {
        arrayFormat: "comma",
      }
    );

    const data = await this.apiFetch(
      `/orgs/all/crawls?${query}`,
      this.authState!
    );
    console.log(data);
    return data;
  }

  private async getCrawl(): Promise<Crawl> {
    const data: Crawl = await this.apiFetch(
      `/orgs/all/crawls/${this.crawlId}/replay.json`,
      this.authState!
    );

    return data;
  }
}
