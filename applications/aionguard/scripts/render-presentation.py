#!/usr/bin/env python3
"""Render presentation diagrams from the published controlled-click evidence.

Requires cairosvg==2.8.2. No cloud calls. SVG is editable; PNG is for sharing.
"""
import json
from html import escape
from pathlib import Path

import cairosvg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/assets'
REPORT = json.loads((ROOT / 'docs/evidence/controlled-click-2026-09-30/report.json').read_text())
assert REPORT['status'] == 'PASS'
BEFORE, AFTER = [REPORT[k]['destinationRequestsSent'] for k in ('baseline', 'protected')]
assert (BEFORE, AFTER) == (4, 0)
assert all(REPORT[k]['cdp']['destinationRequestsSent'] == REPORT[k]['destinationRequestsSent']
           for k in ('baseline', 'protected'))
SECONDS = f"{REPORT['protected']['clickToWarningMs'] / 1000:.2f}"
BG, FG, MUTED, GREEN, LINE = '#101813', '#f1f7f1', '#a8b9aa', '#b9efcc', '#34463b'


def text(x, y, words, size=28, color=FG, weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(words.replace('→', 'to'))}</text>'


def arrow(x, y, end):
    return f'<path d="M{x} {y}H{end}" fill="none" stroke="{GREEN}" stroke-width="3" marker-end="url(#arrow)"/>'


def start(height, title, desc):
    return [f'''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="{height}" viewBox="0 0 1600 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L8 5L1 9" fill="none" stroke="{GREEN}" stroke-width="1.5"/></marker></defs>
<rect width="1600" height="{height}" fill="{BG}"/>
<g font-family="DejaVu Sans,Arial,sans-serif">''',
            text(64, 87, 'AionGuard', 54, FG, 700), text(400, 87, '× Solari', 36, GREEN),
            text(1110, 82, 'CONTROLLED CLICK DEMO', 23, MUTED, 700)]


def save(name, parts):
    svg = ''.join(parts) + '</g></svg>'
    (OUT / f'{name}.svg').write_text(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=str(OUT / f'{name}.png'))


parts = start(1060, 'AionGuard: inspect before the destination',
    'One controlled Chromium comparison. Ordinary click sends four local browser HTTP requests to the destination. '
    'AionGuard holds navigation, inspects the owned page in a prepared Solari sandbox and shows a warning in 1.98 seconds. '
    'The protected browser sends zero destination HTTP requests. No automatic safe-link release is demonstrated.')
parts += [text(64, 165, 'Inspect the link before your browser visits it.', 47, FG, 700),
          text(64, 212, 'The problem: an ordinary click lets the destination reach your browser immediately.', 28, MUTED),
          f'<path d="M64 254H1536" stroke="{LINE}"/>',
          text(64, 310, 'ORDINARY CLICK', 23, MUTED, 700),
          text(64, 371, 'Click the link', 32, FG, 700), arrow(310, 360, 440),
          text(477, 371, 'Browser opens destination', 32, FG, 700), arrow(949, 360, 1110),
          text(1160, 375, str(BEFORE), 88, FG, 700),
          text(1248, 342, 'destination', 27, MUTED), text(1248, 378, 'HTTP requests', 27, MUTED),
          f'<path d="M64 426H1536" stroke="{LINE}"/>',
          text(64, 477, 'WITH AIONGUARD', 23, GREEN, 700)]
steps = [(64, '01', 'Click the link', 'Same owned fixture'),
         (432, '02', 'Hold navigation', 'Your browser waits'),
         (800, '03', 'Inspect in Solari', 'Fresh remote browser'),
         (1168, '04', 'Show the warning', 'Destination stays held')]
for x, number, heading, sub in steps:
    parts += [text(x, 532, number, 24, GREEN, 700), text(x, 577, heading, 30, FG, 700), text(x, 618, sub, 25, MUTED)]
for x in (353, 721, 1089):
    parts.append(arrow(x, 565, x + 55))
parts += [text(432, 711, str(AFTER), 88, GREEN, 700),
          text(514, 678, 'local destination', 25, MUTED), text(514, 711, 'HTTP requests', 25, MUTED),
          text(1168, 711, f'{SECONDS} s', 74, GREEN, 700), text(1168, 752, 'click → warning', 25, MUTED),
          f'<path d="M945 647V784H64" stroke="{LINE}" stroke-width="2" fill="none"/>',
          text(64, 835, 'Why Solari? Prepare once. Inspect at click time.', 32, FG, 700),
          text(64, 878, 'The sandbox is ready before the click. Browser setup happens ahead of time.', 27, MUTED),
          f'<path d="M64 919H1536" stroke="{LINE}"/>',
          text(64, 961, 'One owned fixture · one baseline + one protected click · automated Chromium', 25, MUTED),
          text(64, 1005, 'Reproduce it: docs/controlled-click.md', 25, GREEN, 700),
          text(881, 1005, 'Network counts + timings + screenshots', 25, MUTED)]
save('click-flow', parts)

parts = start(900, 'Four requests to zero. A warning in 1.98 seconds.',
    'AionGuard controlled click comparison. Local browser destination HTTP requests fell from four to zero. '
    'One click-to-warning run took 1.98 seconds with a Solari sandbox prepared beforehand. '
    'The destination stayed held. Evidence: github.com/EXO-Robotics/AionGuard-Solari.')
parts += [text(64, 165, 'Inspect the link before your browser visits it.', 47, FG, 700),
          text(64, 233, 'LOCAL DESTINATION HTTP REQUESTS', 24, MUTED, 700),
          text(978, 233, 'CLICK TO WARNING', 24, MUTED, 700),
          text(64, 414, str(BEFORE), 165, GREEN, 700), arrow(205, 360, 320), text(359, 414, str(AFTER), 165, GREEN, 700),
          text(978, 414, f'{SECONDS} s', 132, GREEN, 700),
          text(68, 470, 'HTTP requests · ordinary vs. AionGuard click', 28, MUTED),
          text(978, 470, 'One prepared-sandbox run', 28, MUTED),
          f'<path d="M64 516H1536" stroke="{LINE}"/>']
for x, heading, sub in [(64, 'Click', 'Same owned page'), (432, 'Hold', 'Local browser waits'),
                        (800, 'Solari inspects', 'Prepared beforehand'), (1168, 'Warning', 'Destination held')]:
    parts += [text(x, 578, heading, 33, FG, 700), text(x, 621, sub, 25, MUTED)]
for x in (353, 721, 1089):
    parts.append(arrow(x, 566, x + 55))
parts += [text(64, 707, 'Solari makes the prepared-sandbox approach practical.', 32, FG, 700),
          text(64, 752, 'Browser setup happens before the click. The inspection happens in the sandbox.', 27, MUTED),
          text(64, 817, 'One controlled Chromium comparison · owned fixture · no automatic safe-link release', 24, MUTED),
          text(64, 861, 'Code + reproducible evidence: github.com/EXO-Robotics/AionGuard-Solari', 25, GREEN, 700)]
save('click-social', parts)
print('Rendered click-flow and click-social as editable SVG and 1600px PNG.')
