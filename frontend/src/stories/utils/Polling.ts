import { html, LitElement, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

import PollTask from "@/controllers/poll";
import type { PollTaskOptions } from "@/controllers/poll/types";

export type RenderProps = PollTaskOptions;

@customElement("btrix-storybook-poll-example")
export class PollExample extends LitElement {
  @property({ type: Number })
  timeoutSeconds?: number;

  count = 0;

  readonly #poll = new PollTask(
    this,
    {
      task: async () => {
        const promise = new Promise((resolve) => {
          window.setTimeout(resolve, 1000);
        });

        return promise.then(() => {
          this.count = this.count + 1;
          return this.count;
        });
      },
      args: () => [] as const,
    },
    {
      timeoutSeconds: this.timeoutSeconds ?? 1,
    },
  );

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("timeoutSeconds")) {
      this.#poll.setOptions({ timeoutSeconds: this.timeoutSeconds });
    }
  }

  render() {
    return html`
      <div>
        ${this.#poll.renderComplete(
          (value) => html`
            Value: ${value}<br />
            Last updated: ${new Date()}
          `,
        )}
        ${this.#poll.renderPending(() => html`<sl-spinner></sl-spinner>`)}
      </div>

      <sl-button
        @click=${() => {
          this.#poll.pause();
        }}
      >
        Pause
      </sl-button>
      <sl-button
        @click=${() => {
          this.#poll.resume();
        }}
      >
        Resume
      </sl-button>
    `;
  }
}

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-storybook-poll-example
    .timeoutSeconds=${props.timeoutSeconds}
  ></btrix-storybook-poll-example>`;
};
