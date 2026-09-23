import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { StoryContext, StoryFn } from "@storybook/web-components";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

export const formControlName = "storybook--form-example";

@customElement("btrix-storybook-form")
export class StorybookForm extends TailwindElement {
  public renderStory!: () => ReturnType<StoryFn>;

  render() {
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();

      const form = e.target as HTMLFormElement;
      const value = serialize(form);

      console.log("form value:", value);
    };

    return html`
      <form class="h-24" @submit=${onSubmit}>
        ${this.renderStory()}
        <footer class="mt-4">
          <sl-button type="reset">Reset</sl-button>
          <sl-button type="submit" variant="primary">Submit</sl-button>
        </footer>
      </form>
    `;
  }
}

export function formDecorator(story: StoryFn, context: StoryContext) {
  const { args } = context;

  return html`
    <btrix-storybook-form
      .renderStory=${() => story(args, context)}
    ></btrix-storybook-form>
  `;
}
