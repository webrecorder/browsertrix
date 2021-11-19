import LiteElement, { html } from "../utils/LiteElement";
import type { Archive, ArchiveConfig } from "../utils/archives";
import type { AuthState } from "../utils/auth";

export class ArchiveConfigsPage extends LiteElement {
  archive!: Archive & {
    authState: AuthState;
  };
  configs: ArchiveConfig;

  static get properties() {
    return {
      archive: { type: Object },
      configs: { type: Array },
    };
  }

  async firstUpdated() {
    if (!this.archive?.authState) {
      // TODO
      return;
    }

    const res = await this.apiFetch(
      `/archives/${this.archive.aid}/crawlconfigs`,
      this.archive.authState
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
