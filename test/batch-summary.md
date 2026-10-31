# Bar Marbles fairness batch, 2026-10-30

116 headless races, 40 marbles each, classic course as deployed that evening (`node bmbatch.js <races> 40 2`; results accumulate in batch-results.json, `node bmbatch.js 0` re-summarizes).

- Winner time: min 51.1 s, p25 59.6, median 61.3, p75 63.0, max 65.3. Fifth place: median 65.2, max 68.1.
- Off-course resets per race: median 2, max 6. Ledge knock-offs per race: median 1, max 6.
- Plinko: rank correlation entry order vs exit order 0.89 (median); first marble in is first out in 72% of races. It is a procession.
- Start grid (slots shuffled each race, 10 rows of 4): wins by row front to back 16 19 12 11 13 8 9 11 8 9 (expected 11.6 each); top-5 finishes by row 91 85 81 52 50 55 43 45 38 40 (expected 58). Front three rows are about twice as likely to finish top 5 as the back three. Columns and colours show no bias (14-colour palette).

## After the first tuning pass (same night, 86 races)

Changes: tornado wall grip 0.3 → 0.2, plinko 8 rows of 0.45 pegs (was 6 of 0.35), ball-to-ball restitution 0.25 → 0.38 with track bounce held low (Min combine rule), jump 2 kick raised, pendulum hammer in the sweep, mid-course losses respawn at the tornado instead of the top, landing bowl 1 widened.

- Winner time: median 65.1 s (was 61.3), range 52.7 to 69.4. Fifth place median 68.9. About 4 s slower, mostly the longer tornado laps.
- Resets per race: median 2, max 9 (was max 6). Ledge knock-offs median 1.
- Plinko: first in is first out 47% (was 72%); rank correlation 0.87 (was 0.89). Better at the front of the field, still a procession in the bulk.
- Start grid, top-5 finishes by row front to back: 50 55 48 47 46 41 46 36 38 23 (expected 43) versus 91 85 81 52 50 55 43 45 38 40 before. The front-row advantage is mostly gone; only the very back row still lags.
- Wins by row: 13 13 8 9 8 6 13 8 7 1 (expected 8.6).
