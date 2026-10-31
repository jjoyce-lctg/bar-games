# Bar Marbles fairness batch, 2026-10-30

116 headless races, 40 marbles each, classic course as deployed that evening (`node bmbatch.js <races> 40 2`; results accumulate in batch-results.json, `node bmbatch.js 0` re-summarizes).

- Winner time: min 51.1 s, p25 59.6, median 61.3, p75 63.0, max 65.3. Fifth place: median 65.2, max 68.1.
- Off-course resets per race: median 2, max 6. Ledge knock-offs per race: median 1, max 6.
- Plinko: rank correlation entry order vs exit order 0.89 (median); first marble in is first out in 72% of races. It is a procession.
- Start grid (slots shuffled each race, 10 rows of 4): wins by row front to back 16 19 12 11 13 8 9 11 8 9 (expected 11.6 each); top-5 finishes by row 91 85 81 52 50 55 43 45 38 40 (expected 58). Front three rows are about twice as likely to finish top 5 as the back three. Columns and colours show no bias (14-colour palette).
