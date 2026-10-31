import json, sys, statistics as st
from collections import Counter
f = sys.argv[1] if len(sys.argv) > 1 else 'batch-results.json'
R = json.load(open(f))['races']; n = len(R)
q = lambda a, p: sorted(a)[int((len(a) - 1) * p)]
wt = [r['winnerTime'] for r in R]; t5 = [(r['finishTimes'][4] if len(r['finishTimes']) > 4 else r['simTime']) for r in R]
def spear(p):
    k = len(p)
    if k < 5: return None
    def rank(v):
        idx = sorted(range(k), key=lambda i: v[i]); r = [0] * k
        for j, i in enumerate(idx): r[i] = j
        return r
    ra = rank([x[0] for x in p]); rb = rank([x[1] for x in p]); return 1 - 6 * sum((ra[i] - rb[i]) ** 2 for i in range(k)) / (k * (k * k - 1))
rho = [x for x in (spear(r['plinko']) for r in R) if x is not None]
fifo = sum(1 for r in R if r['plinko'] and min(r['plinko'], key=lambda x: x[0]) == min(r['plinko'], key=lambda x: x[1])) / n
per_row = int(sys.argv[2]) if len(sys.argv) > 2 else 4
rows = Counter(r['order'][0]['slot'] // per_row for r in R); nrows = (40 + per_row - 1) // per_row
top5 = Counter(m['slot'] // per_row for r in R for m in r['order'][:5])
print(f"{f}: {n} races | winner {q(wt,0)}/{q(wt,.5)}/{q(wt,1)} s (min/med/max) | 5th med {q(t5,.5)} max {q(t5,1)} | resets med {st.median([r['resets'] for r in R])} max {max(r['resets'] for r in R)} | ledge med {st.median([r['offLedge'] for r in R])}")
print(f"  plinko rho med {q(rho,.5):.2f} (p25 {q(rho,.25):.2f}) | first-in-first-out {fifo:.0%}")
print(f"  wins by row ({per_row}/row, front→back): {[rows.get(i,0) for i in range(nrows)]} exp {n/nrows:.1f}")
print(f"  top-5 by row: {[top5.get(i,0) for i in range(nrows)]} exp {5*n/nrows:.1f}")
