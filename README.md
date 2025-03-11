# web-extension-typings-generator

Generates a TypeScript typings file (`.d.ts`) from a folder of `.json` API schema files, as provided in [thunderbird/webext-schemas](https://github.com/thunderbird/webext-schemas) or can be found in the [Firefox codebase](https://github.com/mozilla/gecko-dev) in the folders `/browser/components/extensions/schemas` and `/toolkit/components/extensions/schemas`.

The structure and API Schema is documented in [WebExtensions API Development](https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/index.html).

## Usage

```sh
Generate typings file from web extension schema files.

Usage: generate-web-extension-typings --schemaDir <dir> --outfile <file>

  --schemaDir <dir>    The directory containing the schema files (*.json)
  --outfile <file>     The output file to write the typings to
  --force              Create the directories if they does not exist
  --help               Show this help message
```

## License

`web-extension-typings-generator` is licensed under MPL 2.0.
