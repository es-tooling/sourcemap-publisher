# sourcemap-publisher

A tool to publish sourcemaps externally and rewrite sourcemap URLs at
pre-publish time.

## Install

```sh
npm i -D sourcemap-publisher
```

## Usage

```sh
npx sourcemap-publisher --provenance
```

This will automatically detect which files you have in your `files` array
(`package.json`), and will look up the sourcemaps for them.

Once it has these, it will publish the package to npm under a `sourcemaps`
tag and rewrite the sourcemap URLs to point to the external location.

## Options

| Option | Description |
| -- | -- |
| `--provenance` | Publish to npm with `--provenance` enabled |
| `--dry-run` | Do not publish, run `npm publish --dry-run` |

## License

MIT
