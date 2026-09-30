# AionGuard

**Inspect before exposure.**

You get a link you're not sure about. You want to see what's on the other side without opening it in the browser where you're already signed into everything.

That's the idea behind AionGuard: hold the link, take a look in a separate sandbox, and show you what it found.

![AionGuard's illustrated flow: click, hold, inspect in a prepared Solari sandbox, and show a warning. One controlled test measured 4 versus 0 local destination HTTP requests and 1.98 seconds from click to warning.](docs/assets/inspect-before-exposure.png)

[See the working demo and evidence](docs/controlled-click.md) · [Try it](#try-it) · [Solari fork](https://github.com/EXO-Robotics/solari-cookbook/tree/main/applications/aionguard)

## Where it started

AionGuard started at the **OpenAI Astra Hackathon in New York**. We used Vercel Sandbox for that demo, then rebuilt the isolation layer around Solari.

The interesting part was getting the wait down. Starting a browser from scratch took about 37 seconds. Getting the sandbox ready ahead of time brought our checks down to about **1.4 seconds**.

That made a bigger idea feel possible: put the inspection between the click and the destination.

## What we've shown so far

We tested the same link to our own demo page in two fresh Chromium profiles. The ordinary browser sent **4 HTTP requests** to the destination. With AionGuard, it sent **0**. Solari inspected the page, and a warning appeared **1.98 seconds after the click**. The destination stayed held.

That's one controlled comparison with a sandbox prepared beforehand. It shows this click path working; it doesn't tell us how well AionGuard catches phishing across the web.

[See the actual screenshots, network counts, and steps to reproduce it.](docs/controlled-click.md) The illustration above explains the flow; it isn't a product screenshot.

## Why Solari?

AionGuard handles the checkpoint. Solari gives it somewhere else to open the page.

We keep a prepared VM ready between checks and launch a fresh browser for each inspection. If a check finds something suspicious, we retire that VM and prepare a replacement. The slow setup happens ahead of time.

Across **20 checks of one controlled page**, backend inspection took **1.41 s median and 1.49 s P95**. Those times exclude preparation and are separate from the click-to-warning result above.

![Twenty measured inspections in a prepared Solari sandbox](docs/assets/warm-latency.svg)

[Full timings, setup cost, and cleanup results](docs/warm-solari.md)

Solari is our preferred provider for speed and convenience. The code uses provider adapters so we can support other environments, though automatic fallback still needs work.

## What does it look for?

Five checks look for signs of credential phishing, password forms that submit elsewhere, executable-download lures, tech-support scams, and ClickFix prompts that ask you to run a command. You get the findings and a screenshot to look at.

**Finding nothing doesn't mean a page is safe.** For now, navigation stays held either way. Astra can give an [optional second opinion](docs/astra-review-benchmark.md), but it can't release the link or take actions.

## What's next?

The next step is finishing the decision: when should a held link be released, and what evidence should that require? “No findings” alone won't be enough.

We also need a broader evaluation of missed threats and false alarms, proof of hostile-page containment, and a tested fallback when a provider is unavailable. Our [early tests already show misses and false positives](docs/benchmark.md). This is a prototype for owned test pages, not an extension ready to protect everyday browsing.

## Watch the original demo

[▶ The 56-second hackathon demo](https://www.youtube.com/watch?v=UJkPWHyTg-U)

This video uses **Vercel Sandbox**, recorded during the OpenAI Astra Hackathon in New York. The Solari results are documented above.

## Try it

Use Node 24 LTS:

```sh
git clone https://github.com/EXO-Robotics/solari-cookbook.git
cd solari-cookbook/applications/aionguard
npm ci
npm run build
cp .env.example .env
```

For a preview without cloud credentials, set `AIONGUARD_MODE=MOCK` in `.env`, run `npm start`, and open **http://127.0.0.1:4317**. Connect using the private token in `runtime-data/controller-token`.

To run real inspections against your own harmless test page, follow the [Solari setup guide](docs/quickstart.md). Your credentials stay in the local controller.

[Full submission record](docs/solari-submission.md) · [Run the checks](docs/quickstart.md#checks) · [Presentation kit](docs/presentation.md)

MIT licensed.
