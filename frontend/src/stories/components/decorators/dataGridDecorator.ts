import type { StoryContext, StoryFn } from "@storybook/web-components";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { DataGridRowsController } from "@/components/ui/data-grid/controllers/rows";
import type { GridItem } from "@/components/ui/data-grid/types";
import { serializeDeep } from "@/utils/form";

type DataGridStoryContext = { rowsController: DataGridRowsController };

export const formControlName = "storybook--data-grid-form-example";

@customElement("btrix-storybook-data-grid-form")
export class StorybookDataGridForm extends TailwindElement {
  readonly #rowsController = new DataGridRowsController(this);

  public renderStory!: (context: DataGridStoryContext) => ReturnType<StoryFn>;

  @property({ type: Array })
  items?: GridItem[] = [];

  render() {
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();

      const form = e.target as HTMLFormElement;
      const value = serializeDeep(form, { parseKeys: [formControlName] });

      console.log("form value:", value);
    };

    return html`
      <form @submit=${onSubmit}>
        ${this.renderStory({
          rowsController: this.#rowsController,
        })}
        <footer class="mt-4">
          <sl-button type="reset">Reset</sl-button>
          <sl-button type="submit" variant="primary">Submit</sl-button>
        </footer>
      </form>
    `;
  }
}

export function dataGridDecorator(story: StoryFn, context: StoryContext) {
  return html`<btrix-storybook-data-grid-form
    .items=${context.args.items as GridItem[]}
    .renderStory=${(ctx: DataGridStoryContext) => {
      return story(
        {
          ...context.args,
          ...ctx,
        },
        context,
      );
    }}
  >
  </btrix-storybook-data-grid-form>`;
}
