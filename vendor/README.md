# vendor/

Third-party runtime code, committed on purpose.

There is no `package.json` and no build step here, and that is not an accident:
the project is zero-dependency by design, and the headless suites in `tests/`
must keep running with nothing but `node`. Vendoring is what lets a browser
dependency exist without dragging a toolchain in behind it.

## Why not a CDN

`index.html` and `kb.html` used to pull js-yaml from `cdn.jsdelivr.net` with a
**blocking** `<script>` in the tail of the document. That cost a DNS lookup, a
TLS handshake and a round-trip to a third-party host before the page could
parse any YAML — on top of the per-file YAML fetches the app already makes.

It also made the site's availability depend on a host nobody here controls, and
handed a third party a request log of every visitor. Neither is worth it for
39 KB.

## Contents

| Path | Version | Source | License |
| ---- | ------- | ------ | ------- |
| `js-yaml/js-yaml.min.js` | 4.1.0 | [nodeca/js-yaml](https://github.com/nodeca/js-yaml) | MIT (`js-yaml/LICENSE`) |

`sha256(js-yaml.min.js)` =
`45dc3dd03dc07a06705a2c2989b8c7f709013f04bd5386e3279d4e447f07ebd7`

The bundle is UMD: loaded by a plain `<script>` it assigns the global
`jsyaml`, which is what `kb.js`, `src/challenge/challenge.js` and
`src/sandbox/physical-controller.js` read.

## Updating

Fetched straight from the tag on GitHub — no npm client involved:

```bash
V=4.1.0
curl -fL -o vendor/js-yaml/js-yaml.min.js \
  "https://raw.githubusercontent.com/nodeca/js-yaml/$V/dist/js-yaml.min.js"
curl -fL -o vendor/js-yaml/LICENSE \
  "https://raw.githubusercontent.com/nodeca/js-yaml/$V/LICENSE"
sha256sum vendor/js-yaml/js-yaml.min.js   # update the table above
```

Then load `index.html` in a browser and confirm the YAML-backed content still
renders. Nothing in `tests/` covers this: the headless suites deliberately
never parse YAML.

## Still on a CDN

Nothing, as of the knowledge-base rewrite: the old `kb.html` used to load
**KaTeX 0.16.11** (CSS + two scripts) from jsDelivr for formulas; that page is
gone (`kb.html` is now redirected to `kb/` by `vercel.json`), and the
generated `kb/` pages set formulas as plain monospace text, not LaTeX, so
nothing pulls KaTeX from anywhere any more.
