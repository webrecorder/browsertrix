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

When defining a custom web component in Browsertrix, the `btrix-` prefix is added to the tag to distinguish Browsertrix components from third-party web components. Using the `my-custom-component` example, the component would appear in markup as such:

```html
<btrix-my-custom-component></btrix-my-custom-component>
```

### Defining a Custom Component

Browsertrix includes extensible TypeScript classes for defining custom components. One of the following classes should be used to define a web component, rather than extending `LitElement` directly.

- **`TailwindElement`** — Components that are styled with Tailwind CSS utility classes. Use to define simple, styled UI elements that do not need access to global UI state, do not make API calls, and do not have any global side effects (like navigation.)
- **`BtrixElement`** — Styled components that are contextualized with shared UI state. Use to define complex components that need access to global state to make API calls, and produce global side effects like navigation, toast alerts, or user locale changes.

Regardless of the base class, Browsertrix components are composable. A common pattern is to create a `BtrixElement` that composes multiple `TailwindElement` components or Shoelace components.

The following example is of a component that extends `BtrixElement` to access the current user's name in global state (`this.appState.userInfo`) and renders it as a custom confirmation composed of multiple `TailwindElement` components (`<btrix-alert>`, `<btrix-button>`).

```ts
// my-custom-component.ts
@customElement("btrix-my-custom-component")
class MyCustomComponent extends BtrixElement {
  render() {
    return html`
      <btrix-alert>
        Hello, are you ${this.appState.userInfo.name}?

        <btrix-button>Yes</btrix-button>
      </btrix-alert>
    `;
  }
}
```

### VS Code Snippet

If developing with [Visual Studio Code](https://code.visualstudio.com/), you can generate boilerplate for a `BtrixElement` Browsertrix component by typing in `component` to any TypeScript file and selecting "Btrix Component". Hit ++tab++ to move your cursor between fillable fields in the boilerplate code.

### Unit Testing

Unit test files live next to the component file and are suffixed with `.test` (ex: `my-custom-component.test.ts`).

You can also generate boilerplate for a component test in VS Code by creating a new `.test.ts` file, then typing `test` and selecting "Btrix Component Test".
