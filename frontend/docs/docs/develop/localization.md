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

New languages will be available in user preferences only after the app is redeployed.

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

### Handling expressions in strings

Expressions can be included in strings:

```js
import { msg, str } from "@lit/localize";

msg(str`Welcome, ${name}.`)
```

Translators will see the string expression as-written in code. To aid translations, avoid calculations in expressions and choose a descriptive variable name.

```js
// Instead of this:
//
// msg(str`This file exceeds the maximum of ${5 * 1000 * 1000} bytes.`).

// Try this:
const bytes = 5 * 1000 * 1000;

msg(str`This file exceeds the maximum of ${bytes} bytes.`).
```

Dates and numbers should be localized and pluralized in source code before being assigned to the message string.

For example:

```js
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";

const date = localize.date(new Date());
const count = 200;
const number_of_URLs = `${localize.number(count)} ${pluralOf("URLs", count)}`;

msg(str`You have ${number_of_URLs} pending as of ${date}.`);
```

!!! Tip "Tip: Include a message description for translators."
    You can add additional context for translators using the `desc` option when the variable name may be ambiguous by itself.

    Building on the previous example:

    ```js
    msg(str`You have ${number_of_URLs} pending as of ${date}.`, {
      desc: "`number_of_URLs` example: '1,000 URLs'"
    });
    ```

### Handling HTML in strings

Lit supports HTML in translation strings. However, try to avoid including markup in strings by using multiple `msg()`s. In addition to a performance overhead, strings with HTML are more difficult to manage through the Weblate interface.

```js
// Instead of this:
//
// msg(html`Would you like to continue? <button>Continue</button>`)

// Do this:
html`
  ${msg("Would you like to continue?")} <button>${msg("Continue")}</button>
`
```

When markup is unavoidable, prefer assigning the template to a variable.

```js
const log_in = html`<a href="/log-in">${msg("log in")}</a>`

msg(html`Please ${log_in} to access this page.`, {
  desc: "`log_in` is a link to the log in page"
})
```
