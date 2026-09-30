# AionGuard in 30 seconds

**The story: inspect before exposure.** AionGuard is a hold-and-inspect checkpoint for suspicious links. Solari provides the prepared environment where the inspection runs. In our controlled comparison, local destination HTTP requests went from **4 to 0**, and the warning appeared in **1.98 seconds**. Preparing Solari beforehand makes that workflow practical.

## Ready to share

- [Measured proof / X image](assets/controlled-click.png): 4 normal-browser requests, 0 protected-browser requests, and 1.98 s click to warning.
- [Illustrated flow chart](assets/inspect-before-exposure.png): the inspection-pipeline artwork. Conceptual browser and checkpoint illustrations, paired with measured results.
- [Artwork provenance and prompt](assets/inspect-before-exposure.md)
- [Measured comparison graph](assets/controlled-click.png)
- [Post copy + image alt text](submission-post.md)

## A short walkthrough

This is a suggested narration over the recorded evidence, not a new live demo or a recording of a second run.

| Time | Show | Say |
| --- | --- | --- |
| 0–5 s | [Source link](evidence/controlled-click-2026-09-30/source-link.png) | “An ordinary click opens the destination on your machine.” |
| 5–10 s | [Comparison graph](assets/controlled-click.png) | “In this controlled test, that sent four HTTP requests to the destination.” |
| 10–19 s | [Illustrated flow chart](assets/inspect-before-exposure.png) | “AionGuard holds the browser and inspects the page in a Solari sandbox, already prepared before the click.” |
| 19–25 s | [Actual warning screenshot](evidence/controlled-click-2026-09-30/protected-warning.png) | “Zero destination HTTP requests from the protected browser. A warning in 1.98 seconds. The link stayed held.” |
| 25–30 s | [Reproduction guide](controlled-click.md) | “One owned fixture, one controlled comparison. The code, measurements, and steps to reproduce it are public.” |

Keep “Controlled Chromium demo · owned fixture · prepared sandbox” visible during the walkthrough. The 1.98-second number measures click to rendered warning in one run, with setup beforehand; host automation measured 2.370 seconds. Do not animate a safe-link release or imply the original hackathon video recorded this Solari test.

## For a five-minute review

1. [Read the click experiment](controlled-click.md): scope, actual browser screenshots, reproduction command, request-count methodology.
2. [Inspect its JSON](evidence/controlled-click-2026-09-30/report.json) and [CSV](evidence/controlled-click-2026-09-30/summary.csv).
3. [Check the warm benchmark](warm-solari.md): 20 backend inspections, 1.414 s median / 1.487 s P95, with preparation measured separately.
4. [See the implementation in the official Solari fork](https://github.com/EXO-Robotics/solari-cookbook/tree/main/applications/aionguard).

The [original 56-second video](https://www.youtube.com/watch?v=UJkPWHyTg-U) was recorded with Vercel Sandbox at the OpenAI Astra Hackathon in New York. It tells the project's origin story; the screenshots and measurements above document the Solari work.

## Earlier vector diagrams

Install `cairosvg==2.8.2` in a Python environment, then run:

```sh
python scripts/render-presentation.py
```

The earlier vector renderer reads the published controlled-click JSON and cross-checks the NetLog and DevTools counts. It makes no cloud calls and writes only the four presentation assets. SVGs include descriptive titles and alternative text.

The current illustrated graphic was generated with the built-in image tool. Its prompt and provenance are linked above; the vector renderer does not recreate it.
