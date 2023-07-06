import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import type { Crawl } from "../types/crawler";
import { ROUTES } from "../routes";
import "./org/workflow-detail";
import "./org/crawls-list";

@needLogin
@localized()
export class Crawls extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  crawlId?: string;

  @state()
  private crawl?: Crawl;

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("crawlId") && this.crawlId) {
      this.fetchWorkflowId();
    }
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
    return html`<btrix-crawls-list
      .authState=${this.authState}
      crawlsBaseUrl=${ROUTES.crawls}
      crawlsAPIBaseUrl="/orgs/all/crawls"
      artifactType="crawl"
      isCrawler
      isAdminView
      shouldFetch
    ></btrix-crawls-list>`;
  }

  private async fetchWorkflowId() {
    try {
      this.crawl = await this.getCrawl();
    } catch (e) {
      console.error(e);
    }
  }

  private async getCrawl(): Promise<Crawl> {
    const data: Crawl = await this.apiFetch(
      `/orgs/all/crawls/${this.crawlId}/replay.json`,
      this.authState!
    );

    return data;
  }
}
