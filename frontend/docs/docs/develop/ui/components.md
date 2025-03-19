# Writing Components

The Browsertrix UI is composed of [web components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) written in [TypeScript](https://www.typescriptlang.org/).

Primary UI tools are:

- **[Lit](https://lit.dev/docs/)** — TypeScript framework for building reactive web components. All web application logic and templating is handled in Lit-enhanced web components.
- **[Shoelace](https://shoelace.style/)** — Web component library of common UI components like buttons and form elements. These components are themed with custom CSS variables.
- **[Tailwind](https://tailwindcss.com/)** — CSS utility library of composable classes. Browsertrix components are primarily styled by including Tailwind utility classes in HTML markup, which is rendered by Lit's template system.
- **[`@open-wc/testing`](https://open-wc.org/docs/testing/testing-package/)** — Test helpers for writing web component unit tests.

## Create a New Component

### Directory Structure

Component files should be created under `frontend/src` in the relevant folder:

- **`/components`** — Common UI elements that can be reused throughout the web app.
- **`/features`** — Specialized UI components that can be reused within a particular Browsertrix feature, but aren't generic enough to be reused across the web app. These components usually rely on specific data from the Browsertrix API.
- **`/pages`** — Web components that correspond to a route.

### Naming Convention

Web components names are written are in kebab case (ex: `my-custom-component`). The component file is named after the component (ex: `my-custom-component.ts`).

When defining a custom web component tag in Browsertrix, the `btrix-` prefix is added to distinguish Browsertrix components from third-party web components. Using the `my-custom-component` example, the component would appear in markup as such:

```html
<btrix-my-custom-component></btrix-my-custom-component>
```

### VS Code Snippet

If developing with [Visual Studio Code](https://code.visualstudio.com/), you can generate boilerplate for a custom Browsertrix component by typing in `component` to any TypeScript file and selecting "Btrix Component". Hit ++tab++ to move your cursor between fillable fields in the boilerplate code.

### Unit Testing

Unit test files live next to the component file and are suffixed with `.test` (ex: `my-custom-component.test.ts`).

You can also generate boilerplate for a component test in VS Code by creating a new `.test.ts` file, then typing `test` and selecting "Btrix Component Test".
