# Using Storybook

[Storybook](https://storybook.js.org/) is a tool for documenting and building UI components in isolation. Component documentation is organized into ["stories"](https://storybook.js.org/docs/writing-stories) that show a variety of possible rendered states of a UI component.

Browsertrix component stories live in `frontend/src/stories`. Component attributes that are public properties (i.e. defined with Lit `@property({ type: Type })`) or documented in a TSDoc comment will automatically appear in stories through the [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/analyzer/getting-started/) file.

To develop using Storybook, run:

```sh
yarn storybook:watch
```

This will open Storybook in your default browser. Changes to Browsertrix components and stories wil automatically refresh the page.
