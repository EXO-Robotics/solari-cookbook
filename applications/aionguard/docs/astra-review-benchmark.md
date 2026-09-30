# Astra review timing

Astra can give a second opinion on the warning signs. This benchmark measures that review separately from the browser check.

The default detector still uses the five deterministic rules. This optional reviewer receives only booleans, category names, counts, and relationships such as “unapproved external form.” It receives no page text, URLs, screenshots, credentials, or personal context. Its answer is advisory: **suspicious** or **undetermined**, never permission to open a link.

## Run it

Use Node 22.12+ or Node 24 and an authenticated installed Codex CLI with access to `gpt-6-astra`:

```sh
node --import tsx scripts/benchmark-astra-review.ts --live --runs 6 --output runtime-data/astra-review
```

This makes six live model calls. Runs are capped at ten; an existing output folder is never overwritten. `AIONGUARD_CODEX_PATH` can select the absolute path of the installed CLI. Each call uses medium reasoning, a 90-second timeout, a temporary workspace, a strict output schema, and disabled tools, personal memories, skills, apps, and web search. Authentication stays with the CLI.

The three authored inputs are repeated in order: a page with no structural warning signs, an unapproved password form sending to an unapproved external origin, and an approved login using an approved external identity provider. **These are synthetic structural review inputs, not fresh page inspections or an accuracy dataset.**

## What gets measured

`results.json` and `results.csv` record request start, CLI invocation, response receipt, validation, and return. They include model, request hash, byte counts, verdict, errors, and stage durations. Raw CLI output and credentials are not saved. `summary.json` reports successful-call median and P95 alongside failure counts.

The total includes local setup, CLI startup, authentication and transport, model service, validation, and temporary-file cleanup. The CLI interval is not a direct measurement of model reasoning alone. Small-sample percentiles are descriptive; repeated inputs are not independent website trials.

This is a separate optional component. It does not establish automatic Astra escalation, intercepted Safari clicks, safe navigation release, or protection against hostile pages. Do not add this timing to the warm browser median and call it a measured end-to-end result.

## Measured result — September 30, 2026 UTC

Six calls using the installed Astra CLI at medium reasoning completed successfully:
**7.652 seconds median, 8.901 seconds P95**, with zero failures in that series.
Each of the three authored structural cases was reviewed twice. This is a small
advisory-replay sample, not six independent websites. Percentiles use linear
interpolation; the older warm benchmark uses nearest-rank percentiles.

[Summary](evidence/astra-review-2026-09-30/summary.json) ·
[Every result](evidence/astra-review-2026-09-30/results.json) ·
[CSV](evidence/astra-review-2026-09-30/results.csv)

An initial six-attempt series failed before model invocation because the old
configured executable path did not exist. [Those failures are retained](evidence/astra-review-2026-09-30/initial-unavailable-cli/summary.json)
and excluded from successful-call percentiles. The successful series used Codex CLI 0.159.0 and selected
the actual installed CLI through `AIONGUARD_CODEX_PATH`; no restrictions were relaxed.
Use your installed CLI's absolute path if the historical default is unavailable.

The structural fields are sent to the model service under the operator's existing
CLI login. Full page content and provider credentials are never included.
