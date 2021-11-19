import { LiteElement, html } from "../utils";

type Archive = any;
type ArchiveConfig = any;

export class ArchiveConfigs extends LiteElement {
  archive: Archive;
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
