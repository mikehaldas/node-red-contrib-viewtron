# Releasing

GitHub Actions publishes this package to npm when a GitHub release is published. The [Publish to npm](.github/workflows/publish.yml) workflow uses npm trusted publishing, so there is no npm token and no local `npm login`.

1. Open a pull request that sets `version` in `package.json` to the new version, such as `1.2.3`.
2. Merge that pull request to `main`.
3. Publish a GitHub release tagged `vX.Y.Z`, where `X.Y.Z` is exactly the `version` on that commit. The workflow checks out the tag, runs `npm install` and `npm test`, and runs `npm publish`. If the tag and `package.json` version differ, the workflow fails and nothing is published.

If the `viewtron-sdk` dependency range changes, publish that version of [viewtron-sdk](https://www.npmjs.com/package/viewtron-sdk) to npm before releasing this package. The workflow installs the SDK from npm.

To publish an existing tag again, open **Actions** → **Publish to npm** → **Run workflow** and enter the tag, such as `v2.1.0`.

## One-time npm trusted publisher

A maintainer does this once on npmjs.com, after `publish.yml` is on `main`. npm does not check the values when they are saved; a mismatch fails at publish time.

1. Open [node-red-contrib-viewtron](https://www.npmjs.com/package/node-red-contrib-viewtron) → **Settings** → **Trusted publisher**.
2. Choose **GitHub Actions**.
3. Organization or user: `mikehaldas`
4. Repository: `node-red-contrib-viewtron`
5. Workflow filename: `publish.yml` (filename only, including `.yml`)
6. Environment name: leave blank. The workflow does not use a GitHub environment.
7. Allow direct **`npm publish`**. A trusted publisher created after September 3, 2026 allows only `npm stage publish` until direct publish is selected. This workflow runs `npm publish`. Dist-tag access is not required.

The new configuration must complete a successful publish within 2 days or it expires. Provenance is attached automatically for this public package. Do not add an `NPM_TOKEN` secret.

## Node-RED Flow Library

Publishing to npm does not update the Flow Library. As of April 2020, [flows.nodered.org](https://flows.nodered.org) no longer indexes npm packages on its own ([Node-RED packaging](https://nodered.org/docs/creating-nodes/packaging)).

If this node is not listed yet, add it from the library's **Add a node** page. If it is already listed, sign in and use **request refresh** on the node's page, or submit it again. The catalogue used by Manage palette is rebuilt about every 30 minutes after that.

## Product links (every release)

- [ ] README and release notes link the tested Viewtron camera's product page once, with a descriptive anchor that includes the model (for example "Viewtron LPR-IP4 license plate recognition camera"). No "click here".
- [ ] Release notes / CHANGELOG entry ends with 2-3 links: the product page, the matching developer docs page, and one related guide.
- [ ] Every link is a published page and returns 200: `curl -sL -A 'Mozilla/5.0' -o /dev/null -w '%{http_code}' <url>`. No 404s, no redirect hops, no drafts or preview links.
- [ ] No UTM tags and no rel attributes on links to cctvcamerapros.com or videos.cctvcamerapros.com.
- [ ] Examples use only the plate IB36NL. Viewtron cameras ship set to DHCP; no example address is presented as a default. Only the Viewtron brand is named.
- [ ] Release notes can be edited after publishing to add or fix links (no new version needed). README link fixes ship with the next package version, because npm shows the README from the published package.
