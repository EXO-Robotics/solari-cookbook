# Dependency and presentation provenance audit — 2026-09-30

Read-only audit of `private-artifacts/aionguard-solari-public-20260929`. Production source, active LICENSE, metadata, history, tags, and visibility were not changed by this audit. Inventory is a bounded metadata/notice audit, not a complete legal clearance or binary SBOM.

## Inventory and exact evidence

- `inventory.json` and `inventory.csv`: all 148 package-lock v3 entries, exact version, declared license, dev/optional flags, direct/transitive classification, installed version/license and equality check. The JSON records package and lockfile SHA-256.
- Lock declarations: MIT 98; Apache-2.0 34; MPL-2.0 12; ISC 3; BSD-3-Clause 1.
- 28 entries are not marked dev. 79 entries are installed on this host; platform-specific absent optional entries remain recorded and were not downloaded or independently verified.
- No installed metadata license differed from the corresponding lock entry. This is not proof that all code embedded in a package shares the top-level label.
- `snapshots/`: exact byte copies of 78 installed LICENSE/NOTICE/COPYING files, with SHA-256 and source paths in `snapshot-manifest.json`. Includes all direct-dependency license texts, all four present package-level NOTICE files, full installed MPL and Apache license texts, and bundled license compilations from Vite and Vitest. Preserve these compilations whole; do not replace them with only the top-level SPDX label.
- Five installed entries had no package-root LICENSE/NOTICE/COPYING file: `@esbuild/darwin-arm64` 0.28.2, `@rolldown/binding-darwin-arm64` 1.2.8, `jsonlines` 0.1.1, `stackback` 0.0.2, `std-env` 4.2.0. Their declared MIT metadata is evidence, not an exact notice substitute. Obtain the corresponding upstream notice before shipping those components in a redistributable bundle.

## Direct dependencies

| Package | Version | Declared license | Role |
| --- | --- | --- | --- |
| @solarisdk/sandbox | 0.1.2 | Apache-2.0 | runtime |
| @vercel/sandbox | 3.2.2 | Apache-2.0 | runtime |
| react / react-dom | 19.3.0 | MIT | runtime |
| zod | 4.6.1 | MIT | runtime |
| @types/node | 24.13.4 | MIT | development |
| @types/react / @types/react-dom | 19.3.0 | MIT | development |
| @vitejs/plugin-react | 6.1.1 | MIT | development |
| playwright | 1.58.2 | Apache-2.0 | development metadata; installed separately inside operational guests |
| prettier | 3.9.6 | MIT | development |
| tsx | 4.23.13 | MIT | development metadata; used by start scripts |
| typescript | 7.0.2 | Apache-2.0 | development |
| vite | 8.3.0 | MIT | development |
| vitest | 5.0.0 | MIT | development |

The dev flag does not determine whether something is actually shipped or needed in production. `start` invokes tsx, and guest preparation installs Playwright and Chromium separately. Audit the actual distributable, image and hosted deployment.

## Notice obligations and adoption boundaries

MIT / ISC: retain each applicable copyright and permission notice with redistributed copies or substantial portions. BSD-3-Clause (`source-map-js` 1.2.1): retain its copyright, conditions and disclaimer, including applicable binary-distribution notices and non-endorsement condition. These packages remain under their existing licenses; a new AionGuard license cannot substitute for their permissions or impose a commercial fee on their standalone use.

Apache-2.0: give downstream recipients a copy of the license; preserve applicable attribution notices, preserve relevant NOTICE content, and mark modified files when redistributing modifications. License section 6 does not grant trademark permission. Preserve Playwright/Puppeteer notices and TypeScript's extensive embedded notices. `@solarisdk/core` 0.1.4 and `@solarisdk/sandbox` 0.1.2 ship a 743-byte Apache notice naming **Copyright 2026 Solari Desktop**, not the complete Apache license; retain that exact notice and include the full Apache text separately when redistributing. [Authoritative Apache license, sections 4 and 6](https://www.apache.org/licenses/LICENSE-2.0).

MPL-2.0: `lightningcss` 1.33.0 plus 11 platform variants are declared MPL-2.0 and dev-only in this lock. Distribution of covered executable/library code requires appropriate source availability and notice compliance for covered files; unrelated new files may retain separate terms. Merely generating CSS using the tool does not establish that the generated CSS contains MPL code. Check the shipped artifact before concluding an MPL obligation applies to generated output. [Mozilla's MPL FAQ, questions 8-11 and 17](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

No third-party patent grant or trademark clearance is added by the proposed project license. Existing upstream patent clauses continue to govern the corresponding third-party components on their own terms; this audit does not establish any patent ownership or clearance.

## Beyond package-lock

- Guest provisioning: `src/server/isolation/prepare-image.ts` installs Linux shared libraries through dnf plus Playwright 1.58.2/Chromium; `src/server/isolation/solari.ts` installs Playwright with `--with-deps chromium`. Browser builds, OS libraries, vendor guest images and downloaded executables have licenses beyond package-lock. No VM/image/browser redistribution audit was performed. Reuse and preservation of vendor license/notice packages must be checked before distributing such an image or client bundle.
- Built UI: dist is ignored and its current output has no dedicated LICENSE/NOTICE artifact. The audit does not establish whether every relevant React notice survives minification. A shipping UI/desktop/browser-extension artifact should carry a third-party notice bundle and verify exact dependencies actually included.
- Fonts: no font binary files are tracked. UI styles use system font stacks rather than downloaded web fonts. Plot scripts use DejaVu Sans and export SVG glyph outlines (`svg.fonttype=path`); assess embedded font/glyph attribution obligations for exported images before making broad sole-ownership assertions. CSS font-family names alone do not establish that a font is distributed.

## Assets and provenance gaps

- `docs/assets/README.md` documents `aionguard-social.jpg` as AI-generated conceptual art, and `docs/assets/inspect-before-exposure.md` records the image-generation prompt and provenance for `inspect-before-exposure.png`. This establishes a creation record, not copyrightability, exclusivity, or third-party clearance. Do not claim Blake solely owns all AI outputs without reviewing relevant rights and human contribution.
- Vector plots/diagrams have local generating scripts and measured evidence references. Preserve these provenance records. No general per-file ownership ledger or signed assignment/consent is established by these records.
- `vercel-inspection.png` contains AionPhish fixture artwork. Existing asset notes expressly preserve the respective authors' underlying rights and say inclusion documents an owner-authorized demonstration. Later evidence screenshots include the same externally hosted fixture and benign celebration page. URLs under `mfrey18.github.io/AionPhish` do not by themselves establish ownership or a right to relicense Megan Frey's page/assets. Verify fixture and image permissions separately.
- `link-outcomes.svg/png` are present; the asset README still describes the earlier controlled-click visual as the first visual. No corresponding new asset provenance entry was found in that README. Trace the creation/source and any edited illustration elements before selecting restrictive coverage.
- `docs/planning-provenance.md` records the owner-supplied planning archive, hash and publication authorization. Publication authorization is not automatically an assignment, exclusive license or permission to apply commercial restrictions to third-party authored content.
- External demo video is linked rather than included as a binary in the source tree; its authorship, footage, music and redistribution rights are outside this package-lock audit. Keep linked media outside proposed code coverage unless rights are established.

## Questions for counsel / contributors

1. Identify exact future files and additions that Blake controls; distinguish Megan's contributions and fixture/media assets from Blake-owned changes, MIT historical code, upstream files and generated material.
2. Decide whether author permissions cover alternate future distribution terms, commercial sublicensing and revenue collection; do not infer consent from Git commit authorship or publication authorization.
3. Choose the actual distribution formats (source, browser client, desktop installer, hosted service, guest image), then assemble per-format third-party notices and any MPL covered-source offer.
4. Preserve every historical MIT notice and upstream notice; keep third-party components expressly outside any commercial-restriction scope.
