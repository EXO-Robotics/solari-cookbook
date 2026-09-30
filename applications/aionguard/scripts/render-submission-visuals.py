#!/usr/bin/env python3
"""Rebuild README visuals from the published, immutable warm benchmark.

python -m pip install matplotlib==3.10.8 cairosvg==2.8.2
python scripts/render-submission-visuals.py

SVGs are the publication artifacts. PNG previews are written alongside them.
The overview uses plain SVG; the measured distribution uses Matplotlib.
"""

import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import cairosvg

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/assets"
REPORT = ROOT / "docs/evidence/warm-solari-2026-09-29/report.json"
BG = "#101813"
PANEL = "#19251e"
LINE = "#34463b"
TEXT = "#f1f7f1"
MUTED = "#a8b9aa"
MINT = "#b9efcc"
AMBER = "#efce91"


def overview(median: float, p95: float, count: int) -> None:
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="790" viewBox="0 0 1200 790" role="img" aria-labelledby="title desc">
  <title id="title">AionGuard × Solari: inspect the link before exposure</title>
  <desc id="desc">Product vision: hold external links before the user's browser navigates. Implemented today: a prepared Solari VM runs a fresh browser and five checks, then returns evidence. No finding retains the VM but is not a safe verdict. A finding or error retires it, confirms cleanup, and prepares a replacement. Twenty controlled backend checks measured {median:.2f} seconds median and {p95:.2f} seconds P95.</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="{MINT}" stroke-width="1.5"/></marker>
    <style>text {{font-family:Inter,Arial,Helvetica,sans-serif}} .label {{font-size:14px;font-weight:700;letter-spacing:2px;fill:{MUTED}}} .body {{font-size:20px;fill:{TEXT}}} .small {{font-size:17px;fill:{MUTED}}} .node {{fill:{PANEL};stroke:{LINE};stroke-width:1.5}} .arrow {{fill:none;stroke:{MINT};stroke-width:2;marker-end:url(#arrow)}}</style>
  </defs>
  <rect width="1200" height="790" rx="24" fill="{BG}"/>
  <path d="M48 42 66 32 84 42v21L66 74 48 63z" fill="{MINT}"/>
  <text x="66" y="61" text-anchor="middle" font-size="24" font-weight="800" fill="{BG}">A</text>
  <text x="101" y="61" font-size="26" font-weight="700" fill="{TEXT}">AionGuard <tspan fill="{MUTED}">× Solari</tspan></text>
  <text x="48" y="116" class="label">PRODUCT VISION</text>
  <text x="48" y="167" font-size="43" font-weight="700" fill="{TEXT}">Inspect the link. Keep the risk away.</text>
  <text x="48" y="204" class="body" fill="{MUTED}">Hold external links. Check the destination before the user's browser visits it.</text>
  <text x="48" y="234" class="small">Controlled Chromium interception is demonstrated. Automatic safe-link release remains future work.</text>

  <line x1="48" y1="268" x2="1152" y2="268" stroke="{LINE}"/>
  <text x="48" y="309" class="label">WORKING TODAY</text>
  <text x="1152" y="309" text-anchor="end" class="small">Prepared ahead of the check</text>
  <rect x="48" y="336" width="240" height="114" rx="12" class="node"/>
  <text x="70" y="369" class="label">01 / READY</text>
  <text x="70" y="404" class="body" font-weight="700">Prepared Solari VM</text>
  <text x="70" y="430" class="small">Warm VM, ready to reuse</text>
  <path d="M300 393H327" class="arrow"/>
  <rect x="340" y="336" width="240" height="114" rx="12" class="node"/>
  <text x="362" y="369" class="label">02 / INSPECT</text>
  <text x="362" y="404" class="body" font-weight="700">Fresh browser</text>
  <text x="362" y="430" class="small">Open the registered fixture</text>
  <path d="M592 393H619" class="arrow"/>
  <rect x="632" y="336" width="240" height="114" rx="12" class="node"/>
  <text x="654" y="369" class="label">03 / CHECK</text>
  <text x="654" y="404" class="body" font-weight="700">Five threat patterns</text>
  <text x="654" y="430" class="small">Rules inspect observed facts</text>
  <path d="M884 393H911" class="arrow"/>
  <rect x="924" y="336" width="228" height="114" rx="12" class="node"/>
  <text x="946" y="369" class="label">04 / EXPLAIN</text>
  <text x="946" y="404" class="body" font-weight="700">Evidence + findings</text>
  <text x="946" y="430" class="small">A reviewable result</text>

  <rect x="48" y="478" width="537" height="92" rx="12" fill="{PANEL}"/>
  <circle cx="73" cy="506" r="5" fill="{MINT}"/>
  <text x="90" y="513" class="body" font-weight="700">No finding: keep the VM ready</text>
  <text x="70" y="546" class="small">Result stays undetermined. No finding does not mean safe.</text>
  <rect x="607" y="478" width="545" height="92" rx="12" fill="{PANEL}"/>
  <circle cx="632" cy="506" r="5" fill="{AMBER}"/>
  <text x="649" y="513" class="body" font-weight="700">Finding or error: retire the VM</text>
  <text x="629" y="546" class="small">Confirm cleanup, then prepare a fresh replacement.</text>

  <text x="48" y="624" class="label">MEASURED / CONTROLLED BACKEND CHECKS</text>
  <text x="48" y="689" font-size="54" font-weight="700" fill="{MINT}">{median:.2f}s</text>
  <text x="224" y="685" class="body">median</text>
  <text x="410" y="689" font-size="54" font-weight="700" fill="{MINT}">{p95:.2f}s</text>
  <text x="586" y="685" class="body">P95</text>
  <text x="810" y="686" font-size="39" font-weight="700" fill="{TEXT}">{count} live checks</text>
  <text x="48" y="735" class="small">Owned fixture · after prewarming · not end-to-end click latency or detection accuracy</text>
</svg>'''
    (ASSETS / "solari-overview.svg").write_text(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=str(ASSETS / "solari-overview.png"))


def latency(values: list[float], median: float, p95: float) -> None:
    plt.rcParams.update({
        "font.family": "DejaVu Sans", "font.size": 12,
        "svg.fonttype": "path", "svg.hashsalt": "aionguard-warm-20260929",
        "figure.facecolor": BG, "axes.facecolor": BG,
        "text.color": TEXT, "axes.labelcolor": MUTED,
        "xtick.color": MUTED, "ytick.color": MUTED,
    })
    fig = plt.figure(figsize=(12, 6.8), dpi=100)
    fig.text(.055, .923, "AIONGUARD × SOLARI  /  LIVE WARM BENCHMARK", fontsize=10, color=MUTED, weight="bold")
    fig.text(.055, .855, "Prepared once. Checked in ~1.4 seconds.", fontsize=25, weight="bold")
    fig.text(.055, .79, f"{median:.3f} s median", fontsize=17, color=MINT, weight="bold")
    fig.text(.345, .79, f"{p95:.3f} s P95", fontsize=17, color=AMBER, weight="bold")
    fig.text(.605, .79, f"All {len(values)} checks shown", fontsize=15, color=MUTED)
    ax = fig.add_axes((.10, .25, .83, .445))
    ranks = [100 * (i + 1) / len(values) for i in range(len(values))]
    ax.step(sorted(values), ranks, where="post", color=LINE, linewidth=1.8, zorder=1)
    ax.scatter(sorted(values), ranks, s=43, color=MINT, edgecolor=BG, linewidth=.8, zorder=4)
    ax.axvline(median, color=MINT, linestyle=(0, (4, 4)), linewidth=1.2, alpha=.75)
    ax.axvline(p95, color=AMBER, linestyle=(0, (4, 4)), linewidth=1.2, alpha=.9)
    ax.set_xlim(1.30, 1.78)
    ax.set_ylim(0, 108)
    ax.set_xticks([1.3, 1.4, 1.5, 1.6, 1.7])
    ax.set_yticks([0, 25, 50, 75, 100], ["0%", "25%", "50%", "75%", "100%"])
    ax.set_xlabel("Inspection latency (seconds; detail view)", labelpad=13)
    ax.set_ylabel("Share of checks completed", labelpad=12)
    ax.grid(axis="y", color=LINE, linewidth=.7)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(length=0, pad=9)
    ax.annotate(f"Slowest: {max(values):.3f} s", (max(values), 100), xytext=(-5, -27), textcoords="offset points", ha="right", color=MUTED, fontsize=11)
    fig.text(.055, .105, "One owned fixture · trust calibrated for VM reuse · fresh browser per check · nearest-rank percentiles", fontsize=11, color=MUTED)
    fig.text(.055, .063, "Backend inspect() → validated result; excludes prewarming, click interception and asynchronous retirement.", fontsize=10, color=MUTED)
    fig.savefig(ASSETS / "warm-latency.svg", metadata={"Date": None, "Title": "AionGuard Solari warm inspection latency", "Description": "Empirical distribution of all twenty controlled warm backend inspections. Median 1.414 seconds; P95 1.487 seconds. Not detection accuracy or end-to-end click latency."})
    fig.savefig(ASSETS / "warm-latency.png", dpi=160, metadata={"Software": "AionGuard benchmark visual generator"})
    plt.close(fig)


def main() -> None:
    report = json.loads(REPORT.read_text())
    values = [run["elapsedMs"] / 1000 for run in report["runs"] if run["phase"] == "CALIBRATED_REUSE"]
    assert len(values) == report["completedReuseChecks"] == 20
    assert all(math.isfinite(value) and value > 0 for value in values)
    ordered = sorted(values)
    # Match the published harness: nearest-rank P50 and P95.
    median = ordered[math.ceil(.5 * len(ordered)) - 1]
    p95 = ordered[math.ceil(.95 * len(ordered)) - 1]
    assert math.isclose(median * 1000, report["reuseLatencyMs"]["median"])
    assert math.isclose(p95 * 1000, report["reuseLatencyMs"]["p95"])
    ASSETS.mkdir(parents=True, exist_ok=True)
    overview(median, p95, len(values))
    latency(values, median, p95)
    print(f"Rendered overview and {len(values)} measured points: median={median:.6f}s P95={p95:.6f}s")


if __name__ == "__main__":
    main()
