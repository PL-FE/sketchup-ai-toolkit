# Third-Party Notices

Modified for SketchUp AI Toolkit 0.3.0-alpha.1 on 2026-09-12: dependency versions
and distribution scope below reflect this fork. Upstream attribution is retained.

Local MCP for SketchUp is licensed under Apache License 2.0. It also depends on
third-party software distributed under compatible licenses.

This file is an inventory for the source tree at version `0.3.0-alpha.1`. A
release bundle must additionally contain the license files and the
artifact-specific dependency inventory produced during that build. This file
does not replace the license text shipped by any dependency.

## JavaScript runtime dependencies

| Component | Version in `package-lock.json` | License |
| --- | ---: | --- |
| acorn | 8.16.0 | MIT |
| ajv | 8.20.0 | MIT |
| sharp | 0.35.4 | Apache-2.0 |

Known transitive packages in the locked dependency graph include:

| Component | Version | License |
| --- | ---: | --- |
| @emnapi/runtime | 1.11.3 | MIT |
| @img/colour | 1.1.0 | MIT |
| @img/sharp-* | 0.35.4 | Apache-2.0, with platform package notices |
| @img/sharp-libvips-* | 1.3.3 | LGPL-3.0-or-later |
| detect-libc | 2.1.2 | Apache-2.0 |
| fast-deep-equal | 3.1.3 | MIT |
| fast-uri | 3.1.6 | BSD-3-Clause |
| json-schema-traverse | 1.0.0 | MIT |
| require-from-string | 2.0.2 | MIT |
| semver | 7.8.5 | ISC |
| tslib | 2.8.1 | 0BSD |

The exact `@img/*` packages differ by platform. The macOS Apple Silicon and
Windows x64 service bundles must be audited separately after their production
dependencies are installed.

`sharp` binary distributions may include libvips and its dependencies. libvips
is licensed under LGPL-3.0-or-later. Release bundles must preserve the license
and source-offer information supplied by the corresponding `@img/sharp-libvips-*`
package.

Project pages:

- acorn: <https://github.com/acornjs/acorn>
- ajv: <https://ajv.js.org/>
- sharp and libvips packaging information: <https://sharp.pixelplumbing.com/>

## Offline Three.js preview assets

The modeling skill bundles Three.js **0.180.0** browser modules and
`OrbitControls` under `skills/sketchup-ai-modeling/assets/threejs-preview/vendor/`.
These assets are licensed under **MIT**. The full upstream license is preserved
in `THREE-LICENSE.txt`; `provenance.json` records the npm archive URL and verified
SHA-512 integrity. They are static, locally served preview assets and do not add
a server runtime dependency or make CDN requests.

Upstream: <https://github.com/mrdoob/three.js>

## Bundled Node.js

This fork's source ZIP and Ruby RBZ do not include Node.js, node_modules, sharp
binaries or libvips. Users install Node.js 24.x separately and install locked
dependencies using npm ci. Dependencies retain the notices supplied by npm.
The following bundled-runtime requirements apply if a later service bundle
includes Node.js. Node.js is distributed under the MIT license and includes
third-party software under additional licenses.

Each service bundle must include the `LICENSE` file from the exact upstream
Node.js archive. The release manifest records the upstream URL and SHA-256
checksum. The Node.js source and license information are available from:

- <https://nodejs.org/dist/>
- <https://github.com/nodejs/node>

## SketchUp

SketchUp is not included in this repository or in its release artifacts. Users
must obtain and license SketchUp separately.

## Reporting an omission

If you believe an attribution or license file is missing, contact
<dtzhlq@126.com>. A release must not pass the third-party-license gate while a
known omission remains unresolved.
