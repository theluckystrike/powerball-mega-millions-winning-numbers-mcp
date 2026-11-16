# Data sources

All sources are public, keyless and read at call time. Test fixtures in `test/fixtures/` were downloaded on 2026-11-16.

| Data | URL | Notes |
|---|---|---|
| Powerball winning numbers, beginning 2010 | https://data.ny.gov/resource/d6yy-54nr.json | `winning_numbers` holds the five white balls and then the Powerball; `multiplier` is the Power Play; `double_play_winning_numbers` from 2026-06-03 in this feed. Fixture: the 200 newest rows, 2025-08-06 to 2026-11-14. |
| Mega Millions winning numbers, beginning 2002 | https://data.ny.gov/resource/5xaw-6ayf.json | `winning_numbers` (five white balls), `mega_ball`, and `multiplier` (the old Megaplier, before 2025-04-08). Fixture: the 200 newest rows, 2024-12-17 to 2026-11-13. |
| Powerball prize chart | https://www.powerball.com/powerball-prize-chart | Fixed prizes, Power Play rules. Checked 2026-11-16. |
| Mega Millions prize chart | https://www.megamillions.com/How-to-Play.aspx | $5 game with a 2x to 10x multiplier on every ticket since 2025-04-08. Checked 2026-11-16. |

Queries use the Socrata SODA API (`$order=draw_date DESC`, `$limit`, `$where=draw_date between ...`) without an app token. The hosted server caches the newest draws for 10 minutes and date ranges for 30 minutes. The datasets are published by the New York State Gaming Commission under the NY open data terms.
