# Writing Documentation

Our documentation is built with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) and configured via `mkdocs.yml` in the project root.

The docs can be found in the `frontend/docs` subdirectory.

## Installation

First, change your working directory to `frontend/docs`. Then, to run the docs locally:

=== "pip"

    Install Material for MkDocs:

    ```sh
    pip install mkdocs-material
    ```

    Start the docs development server:
    
    ```sh
    mkdocs serve
    ```

=== "pipx"

    Install Material for MkDocs:

    ```sh
    pipx install mkdocs-material --include-deps
    ```

    Start the docs development server:
    
    ```sh
    mkdocs serve
    ```

=== "uvx"

    Install and start the docs development server:

    ```sh
    uvx --with mkdocs-material --with mkdocs-redirects mkdocs serve
    ```

You can now view a local version of the docs at [localhost:8000](http://localhost:8000).

??? "Differences between self-hosted and Webrecorder hosted docs"
    The docs available online at [docs.browsertrix.com](https://docs.browsertrix.com) may differ from the main branch of [github.com/webrecorder/browsertrix](https://github.com/webrecorder/browsertrix). The online documentation corresponds to the latest hosted Browsertrix production release.

## Adding New Pages

1. Create a Markdown file in the directory of choice
2. Add the newly created Markdown file to the `nav` value under the subsection as defined by the file's location in `mkdocs.yml`.

## Adding Icons

We typically use the [Bootstrap icon set](https://icons.getbootstrap.com/) with our projects. This set is quite expansive, and we don't add the entire set into our docs folder as most icons go unused. If you wish to use an icon when writing documentation to refer to an icon present in part of the app, you may have to download the SVG file and add it to the repo.

Icons are placed in the `docs/overrides/.icons/iconsetname/icon-name.svg` directory, and can be added in markdown files as `:iconsetname-icon-name:` accordingly. After adding icons to the folder, MKDocs must be restarted. For more information, see the [Material for MKDocs page on Changing the logo and icons](https://squidfunk.github.io/mkdocs-material/setup/changing-the-logo-and-icons/#customization).

## Docs Style Guide

### American English

Webrecorder is a global team but we use American English when writing documentation and in-app copy. Some basic rules to follow are:

1. Swap the `s` for a `z` in words like _categorize_ and _pluralize_.
2. Remove the `u` from words like _color_ and _honor_.
3. Swap `tre` for `ter` in words like _center_.
4. Numbers should be formatted with commas for separation of values, using periods to denote decimals (e.g: _3,153.89_, not _3 153,89_).

### Oxford Commas

In a list of three or more items, the list item proceeding the word "and" should have a comma placed after it clarifying that the final item in the list is not a part of the previous item.

##### Example

| Do                         | Don’t                     |
| -------------------------- | ------------------------- |
| One, two, three, and four. | One, two, three and four. |
| Charles, Ada, and Alan.    | Charles, Ada and Alan.    |

### Capitalization of Concepts and Tools

Webrecorder has a number of common nouns that we use in our products. Examples include: archived items, crawl workflows, browser profiles, collections, and organizations. Because these are concepts and not specific instances of each concept, do not capitalize them unless they are at the start of a sentence.

##### Example

When starting a sentence:

> Archived items consist of one or more...

In the middle of a sentence:

> ...they are omitted from the archived items list page...

Webrecorder's software packages are all proper nouns and should always be capitalized. Examples include: Browsertrix, ReplayWeb.page, ArchiveWeb.Page, and PYWB. Specific pages such as the Archived Items page should also be capitalized as they are not referencing the concept of archived items and are instead referencing the page in question that happens to share the same name.

##### Example

> If you want to do x, you can click on y.

Can often be shortened to:

> To do x, click on y.

### Acronyms

Avoid using acronyms when reuse is not frequent enough to warrant space savings. When acronyms must be used, spell the full phrase first and include the acronym in parentheses `()` the first time it is used in each document. This can be omitted for extremely common acronyms such as "URL" or "HTTP".

##### Example

> When running in a Virtual Machine (VM), use the....

### Headings

Titles and primary headings should be in [MLA style title case](https://capitalizemytitle.com/style/MLA/).

##### Example

> Create a New Browser Profile

Secondary and tertiary headings can use sentence case.

##### Example

> Reset previous configuration on save

### Hyphenation & Dashes

Em dashes (—) are always surrounded by spaces when used in sentences. They’re used to separate thoughts without breaking sentences, to indicate a new direction, as an alternative to brackets or commas, etc.

##### Example

> Once a crawl has been analyzed — either fully, or partially — it can be reviewed by pressing the _Review Crawl_ button.

En dashes (–) are used between two values, e.g. 5pm–10pm. They are usually used without spaces surrounding them, though when separating words spaces can be appropriate.

Hyphens (-) are used to link words, e.g. “owner-operator” or “high-fidelity”. They’re only used when needed — when a term would be ambiguously grouped without one, or where not using one would cause a sentence to feel awkward. A good clue is if the term formed by the linked words is acting as an adjective.

Certain terms, such as the ones listed below, should be preferred as hyphenated, rather than not. This is not a strict rule, however — use your best judgment!

| Do             | Don’t          |
|----------------|----------------|
| real-time      | real time      |
| cloud-based    | cloud based    |
| logged-in user | logged in user |

### Referencing Features and Their Options

Controls with multiple options should have their options referenced as `in-line code blocks`.

Setting names referenced outside of a heading should be Title Cased and set in _italics_.

Actions with text (buttons in the app) should also be Title Cased and set in _italics_.

##### Example

> Sets the day of the week for which crawls scheduled with a `Weekly` _Frequency_ will run.

### Manual Word Wrapping

Do not manually wrap words by adding newlines when writing documentation.

### Code Block Syntax Highlighting

Tag the language to be used for syntax highlighting.

##### Example

````markdown
```markdown
example markdown code block text
```
````

For in-line code blocks, syntax highlighting should be added for all code-related usage by adding `#!language` to the start of all in-line code blocks. This is not required for paths or simply highlighting important text using in-line code blocks.

##### Example

```markdown
 `#!python range()`
```

Renders to: `#!python range()`

### Subscription Feature

`Subscription Feature`{ .badge-green .btrix-embed-hidden }

Some features of Browsertrix only pertain to those paying for the software on a hosted plan. Denote these with the following:

```markdown
`Subscription Feature`{ .badge-green .btrix-embed-hidden }
```

### Admonitions

We use [Admonitions](https://squidfunk.github.io/mkdocs-material/reference/admonitions/) in their collapsed state to offer additional context or tips that aren't relevant to all users reading the section. We use standard un-collapsible ones when we need to call attention to a specific point.

There are a lot of different options provided by Material for MkDocs — So many in fact that we try to pair down their usage into the following categories.

???+ Note
    The default call-out, used to highlight something if there isn't a more relevant one — should generally be expanded by default but can be collapsible by the user if the note is long.

!!! Tip "Tip: May have a title stating the tip or best practice"
    Used to highlight a point that is useful for everyone to understand about the documented subject — should be expanded and kept brief.

???+ Info "Info: Must have a title describing the context under which this information is useful"
    Used to deliver context-based content such as things that are dependant on operating system or environment — should be collapsed by default.

???+ Example "Example: Must have a title describing the content"
    Used to deliver additional information about a feature that could be useful in a _specific circumstance_ or that might not otherwise be considered — should be collapsed by default.

???+ Question "Question: Must have a title phrased in the form of a question"
    Used to answer frequently asked questions about the documented subject — should be collapsed by default.

!!! Warning "Warning: Must have a title stating the warning"
    Used to deliver important information — should always be expanded.

!!! Danger "Danger: Must have a title stating the warning"
    Used to deliver information about serious unrecoverable actions such as deleting large amounts of data or resetting things — should always be expanded.

### Images

To style an image, add the `.wr-image` class.

![Image alt text](https://dummyimage.com/600x400/){ .wr-image }
/// caption
Image caption
///

```markdown
![Image alt text](https://dummyimage.com/600x400/){ .wr-image }
/// caption
Image caption
///
```

### Hide in Browsertrix Embed

The user guide is embedded in the Browsertrix web application. You may want to hide certain elements in the embed. To do so, add the `btrix-embed-hidden` class.

```markdown
<!-- Hide heading -->
## Special Heading { .btrix-embed-hidden }

<!-- Hide paragraph -->
This paragraph will be hidden in Browsertrix.
{ .btrix-embed-hidden }

<!-- Hide list item -->
- I'm visible
- I'm visible
- I'm hidden!
{ .btrix-embed-hidden }
- I'm visible

<!-- Hide inline HTML -->
<hr class="btrix-embed-hidden" />
```

### Show in Browsertrix Embed

The `btrix-embed-visible` class will show elements only in the Browsertrix embed:

```markdown
<!-- Show heading -->
## Special Heading { .btrix-embed-visible }

<!-- Show paragraph -->
This paragraph will be visible only in Browsertrix.
{ .btrix-embed-visible }
```
