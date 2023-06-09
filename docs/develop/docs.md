# Writing Documentation

Our documentation is built with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) and configured via `mkdocs.yml` in the project root.

The docs can be found in the `./docs` subdirectory.

To build the docs locally, install Material for MkDocs with pip:

```shell
pip install mkdocs-material
```

In the project root directory run `mkdocs serve` to run a local version of the documentation site.

The docs hosted on [docs.browsertrix.cloud](https://docs.browsertrix.cloud) are created from the main branch of [https://github.com/webrecorder/browsertrix-cloud](https://github.com/webrecorder/browsertrix-cloud)

## Adding New Pages

1. Create a Markdown file in the directory of choice
2. Add the newly created Markdown file to the `nav` value under the subsection as defined by the file's location in `mkdocs.yml`.

## Adding Icons

We typically use the [Bootstrap icon set](https://icons.getbootstrap.com/) with our projects.  This set is quite expansive, and we don't add the entire set into our docs folder as most icons go unused.  If you wish to use an icon when writing documentation to refer to an icon present in part of the app, you may have to download the SVG file and add it to the repo.

Icons are placed in the `docs/overrides/.icons/iconsetname/icon-name.svg` directory, and can be added in markdown files as `:iconsetname-icon-name:` accordingly.  For more information, see the [Material for MKDocs page on Changing the logo and icons](https://squidfunk.github.io/mkdocs-material/setup/changing-the-logo-and-icons/#customization).

## Docs Style Guide

### American English

Webrecorder is a global team but we use American English when writing documentation and in-app copy.  Some basic rules to follow are:

1. Swap the `s` for a `z` in words like _categorize_ and _pluralize_.
2. Remove the `u` from words like _color_ and _honor_.
3. Swap `tre` for `ter` in words like _center_.
4. Numbers should be formatted with commas for seperation of values, using periods to denote decimals (e.g: _3,153.89_, not _3 153,89_).

### Oxford Commas

In a list of three or more items, the list item proceeding the word "and" should have a comma placed after it clarifying that the final item in the list is not a part of the previous item.

##### Example

| Use                           | Don't use                    |
| ----------------------------- | ---------------------------- |
| One, two, three, and four.    | One, two, three and four.    |
| Charles, Ada, and Alan.       | Charles, Ada and Alan.       |

### Acronyms

Avoid using acronyms when reuse is not frequent enough to warrant space savings. When acronyms must be used, spell the full phrase first and include the acronym in parentheses `()` the first time it is used in each document.  This can be omitted for extremely common acronyms such as "URL" or "HTTP".

##### Example

> When running in a Virtual Machine (VM), use the....

### Headings

All headings should be set in [title case](https://en.wikipedia.org/wiki/Title_case).

##### Example

> Indiana Jones and the Raiders of the Lost Ark

### Referencing Features and Their Options

Controls with multiple options should have their options referenced as `in-line code blocks`.

Setting names referenced outside of a heading should be Capitalized and set in _italics_.

##### Example

> Sets the day of the week for which crawls scheduled with a `Weekly` _Frequency_ will run.

### Markdown Formatting

All of Webrecorder's markdown-based docs are written in [GitHub Flavored Markdown](https://github.github.com/gfm/).

#### Manual Word Wrapping

Do not manually wrap words by adding newlines when writing documentation.

#### Code Block Syntax Highlighting

Tag the language to be used for syntax highlighting.

##### Example

```markdown
 ```markdown
 example markdown code block text
 ```
```

For in-line code blocks, syntax highlighting should be added for all code-related usage by adding `#!language` to the start of all in-line code blocks. This is not required for paths or simply highlighting important text using in-line code blocks.

##### Example

```markdown
 `#!python range()`
```

Renders to: `#!python range()`