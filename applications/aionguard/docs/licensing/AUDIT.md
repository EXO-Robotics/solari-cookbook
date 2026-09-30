# Licensing audit — September 30, 2026

This records the pre-adoption audit baseline. The subsequent local prospective framework is in [LICENSE](../../LICENSE); metadata now routes to that file. Existing published code and historical releases remain MIT, and no existing implementation is designated as restricted.

## Repositories and active state

| Item | Audited state |
| --- | --- |
| EXO-Robotics/AionGuard-Solari | Public; main `a124c05022fbf72f1b3b6142a1446152440ffbf2` |
| EXO-Robotics/solari-cookbook | Public fork of solari-sdk/solari-cookbook; main `a470fc87d822988c94d2c205c9b7726d4777dcd0` |
| AionGuard LICENSE, both locations | MIT; Copyright (c) 2026 AionGuard contributors |
| Cookbook root LICENSE | MIT; Copyright (c) 2026 Pinetree Research; matches live upstream text |
| AionGuard package.json + package-lock root entry | `license: MIT`; version `0.1.0`; package `private: true` |
| Contribution policy | Contributions under MIT; third-party notices retained; no CLA or ownership transfer in CONTRIBUTING |
| README | MIT footer and open-source controller description; references preserved release and third-party demo |

Public metadata, main heads, and releases were read with GitHub's API. No network mutations were made. Local history/tag contents were inspected. The cookbook API returned no releases; its application history begins at `7fcf7584e8b5d472a176e04383b4052ad4959a9c`. The local upstream ref was `a435d2ac5ae87bdf9ee4f6c91f97da9501359560`; that ref is not claimed to be the latest upstream head.

## Previously distributed MIT versions

| Release | Commit | License/package metadata |
| --- | --- | --- |
| solari-submission-v1.0.0 | f540c2679730de29db557f3435d833d5d65425b8 | MIT / MIT |
| solari-submission-v1.1.0 | 62efa40016ef815fbad0ae0aa3047c55e5bdcf19 | MIT / MIT |
| solari-submission-v1.2.0 | 328631544440d7a31727a87e5f62c0322d0a2cd0 | MIT / MIT |

GitHub release publication timestamps were September 30, 2026 UTC (00:43:08, 03:02:11, and 10:14:08 respectively). Each package still reports `0.1.0`; package version alone cannot identify the transition. Release tags and commit/path identities are required. Both audited main snapshots also carry MIT. There is **no approved restrictive starting version**.

MIT permits use, modification, distribution, sublicensing, and sale subject to its notices. A later license announcement does not revoke the permissions already validly granted, stop existing MIT forks from selling or hosting that code, or create royalties for those users. Recipients may keep distributing historical MIT code to new recipients under those permissions. This review does not certify that every imported item was originally licensed by its true owner; resolve provenance gaps rather than treating the MIT label as title proof.

For future versions, authorized rights holders can choose a different license for newly published copyrightable contributions and offer separate commercial rights. Keeping an old MIT file inside a new release cannot erase its earlier MIT availability. Restrictions can practically control eligible new additions, not reconstruct exclusivity over the baseline. A restrictive whole-package label without a component map would obscure this boundary. Do not put `MIT OR custom-license` on restricted additions if the goal is to require commercial permission: the MIT option would still authorize commerce.

This proposal leaves all existing tracked implementation, tests, historical documentation/evidence, releases, and assets outside the restrictive scope. Candidates are future rights-cleared controller, client, detector, or managed-service additions. Their paths, exact new material, first restricted commit, effective date, notices, and approving owners must be recorded. Mixed files need a baseline/diff map or separate modules. Already licensed third-party code cannot be made exclusive by renaming it.

## Candidate scope for a future transition

| Area | Current status | What could be covered later |
| --- | --- | --- |
| src/server/runtime and src/server/isolation | Audited baseline distributed under MIT | New rights-cleared controller/provider additions identified by a future commit/diff |
| src/extension and src/ui | Audited baseline distributed under MIT | New client distribution/enrollment/policy modules, if written and rights-cleared |
| src/server/detection and src/contracts | Current material remains under existing permissions | Eligible new detector/contract expression after approval, without claiming ownership of the underlying idea |
| Future managed-service/account/billing components | No covered implementation identified | New separately mapped code under approved commercial/source-available terms |
| docs, evidence, planning, images/video, external fixtures | Historical licenses/provenance and separate rights preserved | Only separately cleared new authored material; no blanket artifact relicensing |
| Cookbook root, examples and other applications | Upstream/other component licenses retained | Outside this proposal |

These are areas for rights mapping, not a file-level license switch or a claim that those future features exist. No glob automatically restricts the current contents. A new release combining baseline and new additions must describe both licenses. A commercial agreement may also sell voluntarily purchased support, warranties or services for an MIT version, but cannot make those optional purchases mandatory for exercise of the MIT rights.

## Dependencies and non-code materials

The locked dependency tree has 148 package entries: MIT 98, Apache-2.0 34, MPL-2.0 12, ISC 3, BSD-3-Clause 1. The 12 MPL entries are development dependencies (lightningcss and platform variants). There are 28 non-development entries. Counts reflect declared lock metadata, not a certification of every bundled file or future binary.

Runtime direct dependencies: @solarisdk/sandbox 0.1.2 and @vercel/sandbox 3.2.2 are Apache-2.0; react/react-dom 19.3.0 and zod 4.6.1 are MIT. Development dependencies include Apache packages, MIT tools, and the MPL build tooling above. Full inventory and available installed license/NOTICE copies are in [dependency-audit](dependency-audit/).

Redistributed MIT/ISC/BSD material needs its applicable notices. Apache redistributions need the license, relevant attribution/NOTICE text, and notices of changes where required; Apache third-party patent and trademark provisions remain their own terms. SDK subscriptions/service terms are separate from SDK code licenses. MPL-covered files, if distributed, need their applicable license/source availability treatment; use of a build tool does not alone relicense unrelated generated AionGuard output. Five installed packages have no package-root notices in the inspected tree; their notices must be sourced before redistributing those components. Some declared development tools serve operational roles (tsx in start scripts, Playwright in guest setup), so dev metadata is not a shipping boundary. Current generated dist has no separate notice artifact. A bundled installer/browser image needs its own component audit, including Chromium/OS/media; this source audit is not that audit.

Existing docs contain MIT historical statements (docs/submission.md and docs/build-decisions.md). Preserve those dated records; future current-facing pages should link to the approved scope map. The separate AionGuard-Local-VM repository, external AionPhish site, video, planning imports, screenshots and generated artwork are not granted new rights by this proposal. [Authorship/provenance](../../AUTHORS.md) lists unresolved rights.

## Protection and limits

Subject to ownership, valid adoption, and enforceability, the proposal would reserve resale, paid hosted access, and commercial bundling of identified new material for a separate agreement. It would leave personal and internal-business use free and protect required notices.

It would not give Blake sole ownership, prohibit commercial use of the MIT baseline, guarantee payment, force a price or revenue share, monopolize the inspection idea, prevent independent implementation, establish patents, grant brand rights, or bind Megan to terms she has not accepted. The public code remains inspectable. Determining copyrightable human contributions and mixed work boundaries requires counsel, especially for AI-assisted material. No enforceability opinion is supplied.
