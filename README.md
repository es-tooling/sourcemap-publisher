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

This will do the following:

- Load the files in your `files` array in `package.json`
- Find the sourcemaps any of these files reference
- Package up these sourcemaps under `{packageName}@{version}-sourcemaps`
- Rewrite the sourcemap URLs in the original sources to point at a CDN for
this sourcemap package

You should run this command **after your build**, but **before** you publish.

## Example setup

It is important to get the ordering right so you do not overwrite the
rewritten sourcemap URLs.

Generally, the order should be as follows:

- Build your package
- Run `sourcemap-publisher` to publish the sourcemaps and rewrite the URLs
- Run `npm publish` to publish the rewritten sources

You can achieve this through a `prepublishOnly` script in your `package.json`:

```json
{
  "scripts": {
    "prepublishOnly": "npm run build && sourcemap-publisher --provenance"
  }
}
```

## Options

| Option | Description |
| -- | -- |
| `--provenance` | Publish to npm with `--provenance` enabled |
| `--dry-run` | Do not publish, run `npm publish --dry-run` |

## License

MIT
