# Submission post draft

Prepared for the user to post. Nothing has been posted to X or LinkedIn.

## Main post

Attach [controlled-click.png](assets/controlled-click.png).

> Normal click: 4 destination requests. AionGuard: 0. Warning in 1.98s.
>
> AionGuard holds navigation while a prepared Solari sandbox inspects the page. One controlled Chromium test on our owned fixture.
>
> https://github.com/EXO-Robotics/AionGuard-Solari
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

Measured controlled-click comparison. The normal browser sent 4 HTTP requests to the destination; the AionGuard-protected browser sent 0. The warning appeared in 1.98 seconds with a Solari sandbox prepared beforehand, or 2.37 seconds including host automation. One owned fixture, one baseline and one protected Chromium click. The destination stayed held. These are request counts, not detection accuracy.
