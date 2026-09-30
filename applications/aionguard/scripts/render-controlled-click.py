#!/usr/bin/env python3
"""Render the recorded local-browser request comparison (not detection accuracy)."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator

root = Path(__file__).resolve().parents[1]
d = json.loads((root / 'docs/evidence/controlled-click-2026-09-30/report.json').read_text())
assert d['status'] == 'PASS'
counts = [d[k]['destinationRequestsSent'] for k in ['baseline', 'protected']]
assert counts == [4, 0]
assert all(d[k]['cdp']['destinationRequestsSent'] == counts[i] for i, k in enumerate(['baseline', 'protected']))
bg, text, muted, mint, amber = '#f4f1e8', '#142826', '#65716b', '#ed693e', '#aeb8b1'
plt.rcParams.update({'font.family':'DejaVu Sans', 'figure.facecolor':bg, 'axes.facecolor':bg,
                     'text.color':text, 'xtick.color':muted, 'ytick.color':text,
                     'svg.fonttype':'path', 'svg.hashsalt':'aionguard-controlled-click'})
fig = plt.figure(figsize=(12,6.2), dpi=100)
fig.text(.055,.925,'AIONGUARD × SOLARI  /  CONTROLLED CLICK DEMONSTRATION',fontsize=10,color=muted,weight='bold')
fig.text(.055,.837,'Normal click: 4 requests. AionGuard: 0.',fontsize=25,weight='bold')
fig.text(.055,.775,'Destination HTTP requests: normal browser vs. protected browser',fontsize=13,color=muted)
ax=fig.add_axes((.20,.31,.39,.32))
ax.barh([1,0],counts,color=[amber,mint],height=.42)
ax.plot(0,0,'o',color=mint,markersize=8,clip_on=False)
for y,n,c in zip([1,0],counts,[amber,mint]):ax.text(n+.12,y,str(n),va='center',fontsize=20,weight='bold',color=c)
ax.set_yticks([1,0],['Normal click','AionGuard click']);ax.set_xlim(0,5);ax.set_ylim(-.65,1.65)
ax.xaxis.set_major_locator(MaxNLocator(integer=True));ax.tick_params(length=0,pad=12)
ax.grid(axis='x',color='#d9ddd6',linewidth=.6);ax.set_axisbelow(True)
for spine in ax.spines.values():spine.set_visible(False)
fig.text(.67,.59,f"{d['protected']['clickToWarningMs']/1000:.2f} s",fontsize=43,color=mint,weight='bold')
fig.text(.67,.52,'click → warning',fontsize=18)
fig.text(.67,.46,'One prepared-sandbox run',fontsize=12,color=muted)
fig.text(.67,.41,'2.37 s including host automation',fontsize=11,color=muted)
fig.text(.055,.19,'The destination stays held. Solari inspects it and returns the finding.',fontsize=15,weight='bold')
fig.text(.055,.12,'One owned fixture · separate disposable Chromium profiles · NetLog + DevTools agree',fontsize=11,color=muted)
fig.text(.055,.075,'Zero HTTP sends in this test browser; not zero DNS/TCP/TLS contact or a detection-rate claim.',fontsize=10,color=muted)
out=root/'docs/assets'
fig.savefig(out/'controlled-click.svg',metadata={'Date':None,'Title':'Controlled click: four local destination HTTP requests versus zero'})
fig.savefig(out/'controlled-click.png',dpi=160)
plt.close(fig)

svg_path = out / 'controlled-click.svg'
svg_path.write_text('\n'.join(line.rstrip() for line in svg_path.read_text().splitlines()) + '\n')
