import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import type { Archive, ArchiveConfig } from "../types/archives";
import type { AuthState } from "../types/auth";

@needLogin
export class ArchiveConfigsPage extends LiteElement {
  archive!: Archive;
  authState!: AuthState;
  configs: ArchiveConfig;

  static get properties() {
    return {
      archive: { type: Object },
      configs: { type: Array },
    };
  }

  async firstUpdated() {
    const res = await this.apiFetch(
      `/archives/${this.archive.aid}/crawlconfigs`,
      this.authState!
    );
    this.configs = res.crawl_configs;
  }

  render() {
    return html`<div>Archive Configs!</div>
      ${this.configs &&
      this.configs.map(
        (config: ArchiveConfig) => html`
          <div>${config.crawlCount} ${config.config.seeds}</div>
        `
      )} `;
  }
}
