import { Task } from "@lit/task";
import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import PollController from "@/controllers/poll";

export type RenderProps = {};

@customElement("btrix-storybook-poll-example")
export class PollExample extends LitElement {
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

  render() {
    return this.#task.render({
      complete: (value) => html`
        Value: ${value}<br />
        Last updated: ${new Date()}
      `,
    });
  }
}

export const renderComponent = () => {
  return html`<btrix-storybook-poll-example></btrix-storybook-poll-example>`;
};
