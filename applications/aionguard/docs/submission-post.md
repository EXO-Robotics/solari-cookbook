# Submission post draft

Prepared for review. Not posted to X or LinkedIn.

## Short post

I’m building AionGuard × Solari to inspect links before they reach your browser.

20 live controlled checks: 1.41s median, 1.49s P95 in a prepared sandbox. Flagged checks retire it and warm a replacement.

Code + evidence: https://github.com/EXO-Robotics/AionGuard-Solari

@harrychow_ @getsolari

## Demo caption / follow-up

The original demo was recorded with Vercel Sandbox during the OpenAI Astra Hackathon in New York. This submission runs on Solari, our preferred provider for speed and convenience.

The current prototype also demonstrates a real intercepted Chromium click against our owned fixture: 4 local destination HTTP requests without AionGuard, 0 with it, and a warning in 1.98 seconds. One controlled comparison, not a detection-rate claim. General browser deployment and safe-link release remain future work. The 1.41-second figure still refers to backend checks after preparation.

Official Solari fork: https://github.com/EXO-Robotics/solari-cookbook/tree/main/applications/aionguard

[Watch the original 56-second demo](https://www.youtube.com/watch?v=UJkPWHyTg-U).

The short post may need splitting to fit the account’s X character limit. Provider preference is not a measured comparison with Vercel or other VMs.
