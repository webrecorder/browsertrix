import { LiteElement, html } from "../utils";

type Archive = any;
type AuthState = any;

export class MyAccount extends LiteElement {
  archiveList: Archive[] = [];
  authState: AuthState;

  static get properties() {
    return {
      authState: { type: Object },
      archiveList: { type: Array },
      id: { type: String },
    };
  }

  async firstUpdated() {
    if (!this.authState) {
      this.dispatchEvent(new CustomEvent("need-login"));
      return;
    }

    const data = await this.apiFetch("/archives", this.authState);
    this.archiveList = data.archives;

    const data2 = await this.apiFetch("/users/me", this.authState);
    this.id = data2.id;
  }

  render() {
    return html`
      <div class="container bg-base-200 m-auto border rounded-lg px-8 py-8">
        <h2 class="text-2xl font-bold">Your Archives</h2>
        ${this.archiveList.map(
          (archive) => html`
            <div
              class="card mt-6 ml-6 border rounded-none border-gray-600 hover:bg-gray-300"
            >
              <div class="card-body">
                <div class="card-title">
                  <span class="mr-4">${archive.name}</span
                  >${this.getAccessValue(archive)}
                </div>
                <div class="card-actions">
                  <a
                    class="btn btn-primary"
                    href="/archive/${archive.id}"
                    @click="${this.navLink}"
                    >View Archive</a
                  >
                </div>
              </div>
            </div>
          `
        )}
      </div>
    `;
  }

  getAccessValue(archive: Archive) {
    const value = archive.users && archive.users[this.id];
    switch (value) {
      case 40:
        return html`<div class="badge badge-info">Owner</div>`;

      default:
        return "";
    }
  }
}
