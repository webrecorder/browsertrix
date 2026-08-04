import { Task } from "@lit/task";
import { html, LitElement, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

import PollController from "@/controllers/poll";
import type { PollControllerOptions } from "@/controllers/poll/types";

export type RenderProps = PollControllerOptions;

@customElement("btrix-storybook-poll-example")
export class PollExample extends LitElement {
  @property({ type: Number })
  timeoutSeconds?: number;

  count = 0;

  readonly #task = new Task(this, {
    task: async () => {
      this.count = this.count + 1;
      return this.count;
    },
    args: () => [] as const,
  });

  readonly #poller = new PollController(this, {
    task: this.#task,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("timeoutSeconds")) {
      this.#poller.setOptions({ timeoutSeconds: this.timeoutSeconds });
    }
  }

  render() {
    return html`
      <div>
        ${this.#task.render({
          complete: (value) => html`
            Value: ${value}<br />
            Last updated: ${new Date()}
          `,
        })}
      </div>

      <sl-button @click=${() => this.#poller.pause()}>Pause</sl-button>
      <sl-button @click=${() => this.#poller.resume()}>Resume</sl-button>
    `;
  }
}

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-storybook-poll-example
    .timeoutSeconds=${props.timeoutSeconds}
  ></btrix-storybook-poll-example>`;
};
