# Localization

The Browsertrix UI supports multiple languages. Browsertrix end users can set a language preference in their account settings.

## Contributing

Translations are managed through Weblate, a web-based translation tool. Registration is free! Once registered, you can submit translations for review by Browsertrix maintainers.

**[Register for Weblate](https://hosted.weblate.org/engage/browsertrix/)**

## Adding a Language

Adding support for a new language involves a small code change. If you'd like to add a new language and would prefer that a Browsertrix maintainer make the change, submit a [**Localization Request** on GitHub](https://github.com/webrecorder/browsertrix/issues/new/choose). A Browsertrix maintainer will respond to your request on GitHub.

To add a new language directly through code change:

1. Look up the [BCP 47 language tag](https://www.w3.org/International/articles/language-tags/index.en#registry) and add it to the `targetLocales` field in `lit-localize.json`.
```js
{
  // ...
  "sourceLocale": "en",
  "targetLocales": [
    "es",
    // Add your language tag here
    ],
}
```

2. Generate a new XLIFF file by running:
  ```sh
  yarn localize:extract
  ```
  This will add an `.xlf` file named after the new language tag to the `/xliff` directory.

3. Open a pull request with the changes.
4. Once the pull request is merged, manually refresh the language list in the [Weblate Browsertrix project](https://hosted.weblate.org/projects/browsertrix). Translations are managed entirely through the Weblate interface.

## Making Strings Localizable

All text should be wrapped in the `msg` helper to make them localizable:

```js
import { msg } from "@lit/localize";

// later, in the render function:
render() {
  return html`
    <button>
      ${msg("Click me")}
    </button>
  `
}
```

See [Lit's message types documentation](https://lit.dev/docs/localization/overview/#message-types) page for details.
