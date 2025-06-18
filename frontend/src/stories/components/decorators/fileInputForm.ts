import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { StoryContext, StoryFn } from "@storybook/web-components";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import type { RenderProps } from "../FileInput";

import { TailwindElement } from "@/classes/TailwindElement";

export const formControlName = "storybook--file-input-form-example";

@customElement("btrix-storybook-file-input-form")
export class StorybookFileInputForm extends TailwindElement {
  public renderStory!: () => ReturnType<StoryFn>;

  render() {
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();

      const form = e.target as HTMLFormElement;
      const value = serialize(form);

      console.log("form value:", value, form.elements);
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

export function fileInputFormDecorator(
  story: StoryFn,
  context: StoryContext<RenderProps>,
) {
  return html`
    <btrix-storybook-file-input-form
      .renderStory=${() => {
        return story(
          {
            ...context.args,
          },
          context,
        );
      }}
    ></btrix-storybook-file-input-form>
  `;
}
