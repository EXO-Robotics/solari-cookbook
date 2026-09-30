# Historical activation examples and future component checklist

The prospective framework has now been installed locally. These earlier examples remain preparation records; do not apply them as a second blanket switch. Component designation and formal contributor/commercial agreements remain separate steps.

# Conditional adoption changes — DO NOT APPLY NOW

The local review patch adds audit/proposal documents and attribution, but keeps active LICENSE and `license: MIT`. The examples below show the corresponding changes **only after** legal review, contributor consent, and a completed component map. They are not an adoption-ready patch because no restricted component or first release has been approved.

## Required gate

1. Rights-map Blake and Megan's contributions and imported assets; document authorization from all necessary holders. Execute an approved commercial licensing/inbound agreement where required.
2. Finalize license definitions and law/assent/enforcement provisions with a software-IP attorney. Confirm paid hosting vs internal hosted use, contractors/affiliates, bundles, support, trials and indirect funding.
3. Complete the coverage manifest with exact new contribution identities, notices, owners, effective commit and future version. Never use the three historical tags or audited MIT main as the restrictive starting scope.
4. Preserve all MIT baseline and upstream/dependency notices. Put eligible new material in separate modules if possible. For mixed files, identify baseline + diff; do not claim whole-file exclusivity over old code.
5. Apply a future policy prospectively in both application locations, preserving cookbook root MIT. Keep repositories public and historical tags/releases untouched.

## Future README replacement

Replace the current MIT-only footer and relevant current-facing open-source claims with wording such as:

> AionGuard contains MIT-licensed baseline components and, for the specifically identified future additions in the coverage manifest, source-available components. Those additions are free for personal and internal-business use. Resale, paid hosting for customers, and commercial bundling require a separate written commercial agreement. Earlier MIT releases and grants remain available under their original terms. See LICENSE, the component map, authorship, third-party notices, and the commercial guide.

Replace "open-source inspection and navigation controller" only where referring to restricted additions with "source-available inspection and navigation components". Do not mislabel the remaining MIT baseline. SolariGuard remains a proposed service/name; do not infer brand endorsement from licensing.

## Future LICENSE and preserved notices

Standalone root LICENSE and cookbook **applications/aionguard/LICENSE** should become an explicit license **routing document** for the mixed package, pointing to the finalized source-available license, the approved coverage map, and preserved `LICENSES/MIT-AionGuard-legacy.txt`. Do not simply prepend commercial restrictions to MIT. Route every unlisted baseline file to its existing license; third-party materials retain theirs.

Keep cookbook root LICENSE byte-for-byte. Preserve its Pinetree notice wherever upstream material is copied into a distribution. In the fork root README, change the broad "MIT licensed" summary to "Upstream cookbook material is MIT; see applications/aionguard/LICENSE for that application's component terms" if and only if its future terms actually differ. Other applications are outside this proposal.

## Future package metadata

For each AionGuard package.json, and only the root `packages[""]` metadata of its package-lock.json, use:

```json
{"license": "SEE LICENSE IN LICENSE"}
```

The routed LICENSE must exist at the package root and accurately explain the mixed scope. Retain `private: true`. Keep dependency license metadata unchanged. Do not use `UNLICENSED`, claim an OSI/SPDX-approved identifier for this custom draft, or use `MIT OR custom` for commercially restricted new additions. Choose a new version only when a future release is approved; synchronize the lock's package version then. No version bump is proposed in this review.

## Future CONTRIBUTING replacement

Replace MIT-only inbound text with:

> Identify the component license before submitting. Contributions to MIT baseline components remain MIT. Contributions to covered source-available components require the approved contributor agreement, including authority for the documented outbound terms and separate commercial licensing. Contributors retain ownership except as expressly agreed in writing. Preserve third-party licenses and identify copied or generated material. Past contributions are not retroactively bound by this policy.

Do not accept restricted-component contributions until that agreement and signing process exist. A checkbox, GitHub PR, or attribution line alone is not evidence of Megan's approval or a copyright assignment.

## What this local patch changes today

- Adds AUTHORS.md and records Blake/Megan attribution without sole ownership.
- Adds contributors names in package metadata; no dependency/version/license change.
- Adds README and CONTRIBUTING links to this expressly unadopted review.
- Adds the draft, scope template, commercial guide, audit and approval steps.
- Leaves active licenses, history, tags, releases and other cookbook applications unchanged.

[Conditional example diff](after-approval/activation-changes.diff.txt) · [Future mixed-license routing example](after-approval/LICENSE-ROUTING.example.txt). These include unresolved identities and are deliberately not apply-ready.

Attorney boundary review must also decide whether licensee-authored modifications are subject to reciprocal terms when redistributed gratis, and whether a paid managed-service operator qualifies for the internal-deployment contractor exception. Do not infer either answer from this draft.
