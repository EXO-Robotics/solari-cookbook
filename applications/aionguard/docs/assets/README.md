# Presentation assets

## Current Solari presentation

- **`controlled-click.svg` / `controlled-click.png`** is the first README visual and the suggested X attachment. Its request counts and timing are read directly from the controlled-click report. The light palette matches the conceptual illustration below.

- **`inspect-before-exposure.png`** is the conceptual inspection-pipeline graphic: an original conceptual illustration of click, hold, remote inspection, and warning. It is not a screenshot or containment proof. The 4-to-0 HTTP request comparison and 1.98-second timing come from the published controlled-click report. [Prompt and provenance](inspect-before-exposure.md).

## Earlier vector presentation

- `click-flow.svg` / `click-flow.png`: README flow chart showing an ordinary click and the controlled AionGuard click. The sandbox is prepared beforehand; navigation remains held after the finding.
- `click-social.svg` / `click-social.png`: 1600 × 900 image for X, with the measured 4-to-0 local destination HTTP requests and 1.98-second click-to-warning result. One owned fixture, one baseline and one protected click.
- These are evidence-based diagrams, not application screenshots. Counts and timing are read from `docs/evidence/controlled-click-2026-09-30/report.json` by `scripts/render-presentation.py`. The existing `controlled-click` comparison graph and `warm-latency` distribution remain separate measurements.
- [Post copy, alt text](../submission-post.md) · [30-second walkthrough and evidence links](../presentation.md).

## Earlier assets and provenance

- `aionguard-social.jpg`: original AI-generated cover illustration, created with the built-in image-generation tool. It is conceptual artwork, not a screenshot or evidence of product behavior. The generated PNG was converted to JPEG for GitHub's social-preview upload; no scene elements or text were changed. Dimensions: 1774 × 887; under 1 MB.
- `workflow.svg`: original editable vector diagram. It explicitly distinguishes the recorded demo, earlier synthetic Astra experiments, and the future post-phishing Astra upgrade (gather incident data, draft an IT email, investigate possible sandbox leaks). Tripwire (likely harmful use of captured credentials) and continuity (recover needed systems into secured microVMs during device containment) remain longer-term plans. Labels and icons supplement the README text; they do not add verification claims.
- `vercel-inspection.png`: unchanged captured page image from the first recorded Vercel inspection, case `run_be77484e-073c-4459-9c52-b5600320f622`, September 10, 2026. It contains the controlled AionPhish fixture rather than private desktop/email content. The private corresponding receipt records Vercel provenance and sandbox cleanup. It is not a live remote-browser feed. The fixture artwork belongs to its respective authors; inclusion documents the owner-authorized demonstration and does not change its underlying terms.

The social preview follows [GitHub's image guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview). All public presentation assets are self-contained. Original private recordings, messages, tokens, and raw operational receipts remain excluded.

## Cover generation prompt

Use case: ads-marketing. Create a finished original illustrated GitHub social preview and README cover for AionGuard, a hackathon security investigation project. Wide 2:1 composition, ideally exactly 1280 by 640 pixels. Visual thesis: playful nautical curiosity meets a carefully controlled laboratory. A tiny cream paper boat with a small red fishing lure/hook is suspended inside a clear glass inspection bell on the right, mint illumination, subtle ripples on a deep midnight teal sea; beautiful tactile editorial illustration with clean shapes and restrained grain, not a mockup or a screenshot. One coherent full-bleed scene, generous dark negative space on the left, sophisticated yet fun. Brand "AionGuard" must be the largest element, upper/lowercase exactly as spelled, clean bold warm ivory sans-serif. Below brand put exactly "AI investigates." then "Evidence decides." in smaller readable type. Bottom left put exactly "A hackathon prototype" in small but readable mint text. Only those words, no extra labels. No OS lockdown claim, no shields, no skulls, no code texture, no dashboard panels, no stock-photo businessman, no third-party logos, no watermark. Keep text and illustration comfortably inside a 60-pixel safe border. Clear readable typography at small social card size. Solid opaque background. Deliver the single finished card, not a presentation of the card.
