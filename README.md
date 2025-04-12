# sourcemap-publisher

A tool to publish sourcemaps externally and rewrite sourcemap URLs at
pre-publish time.

## Install

```sh
npm i -D sourcemap-publisher
```

## Usage

```sh
npx sourcemap-publisher lib/ --provenance
```

## Options

| Option | Description |
| -- | -- |
| `--provenance` | Publish to npm with `--provenance` enabled |
| `--dry-run` | Do not publish, run `npm publish --dry-run` |

## License

MIT
