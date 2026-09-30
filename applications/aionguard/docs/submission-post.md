# Submission post draft

Prepared for the user to post. Nothing has been posted to X or LinkedIn.

## Main post

Attach [inspect-before-exposure.png](assets/inspect-before-exposure.png).

> AionGuard: inspect before exposure.
>
> A hold-and-inspect checkpoint, powered by Solari.
>
> Controlled test: 4 → 0 local destination HTTP requests. Click → warning: 1.98s, with Solari ready beforehand.
>
> Code + evidence: https://github.com/EXO-Robotics/AionGuard-Solari
>
> @harrychow_ @getsolari

The main post fits a standard 280-character X post when the URL is counted as 23 characters.

## Follow-up: the story

> AionGuard started at the OpenAI Astra Hackathon in New York. The original video used Vercel Sandbox.
>
> We rebuilt the isolation layer around Solari, our preferred provider for speed and convenience. Preparing the sandbox before a click makes remote inspection practical.

Attach the original video only with that provider context. [Original 56-second demo](https://www.youtube.com/watch?v=UJkPWHyTg-U).

## Follow-up: the evidence

> One owned fixture. One baseline and one protected Chromium click. Both network recordings agreed: 4 destination HTTP requests vs. 0 from the local browser.
>
> The destination stayed held. General browser deployment and automatic safe-link release are next.

[Reproduction steps, screenshots, JSON, CSV, and source hashes](controlled-click.md).

The 1.98-second result is one automated click-to-rendered-warning run, with preparation before the click; the host-automation span was 2.370 seconds. It is not a detection-rate claim. Solari preference is not a measured comparison with another provider. Zero destination HTTP requests does not mean zero DNS/TCP/TLS contact.

## Image alt text

Conceptual illustration of AionGuard, a hold-and-inspect checkpoint powered by Solari. Local browser HTTP requests to the destination: ordinary click 4, protected click 0. The flow is click, hold navigation, inspect in a Solari sandbox prepared beforehand, and show a warning while the destination stays held. Click to warning took 1.98 seconds in one controlled Chromium comparison against an owned fixture. Code and reproducible evidence are linked in the post.
