# Genshin Friends Leaderboard

A small web app that ranks you and your friends by Genshin Impact profile stats, using the public [Enka.Network API](https://api.enka.network). Add players by UID; no login needed.

- **Players tab:** rank by Spiral Abyss, Imaginarium Theater, Adventure Rank, achievements or best crit value. Click a player to see their showcase characters.
- **Characters tab:** compare everyone's builds side by side, overall or for one character, ranked by roll score, crit value, ATK, HP, DEF, EM, Energy Recharge, crit rate, crit DMG or DMG bonus. Click a build to see its 5 artifacts.
- **Artifacts tab:** Hall of Fame (best rolled +20 artifacts in the group) and Hall of Shame (fewest useful rolls).
- **Head-to-head tab:** pick two players and compare profile stats and shared characters, with a running score.
- **Awards tab:** 14 auto-awarded titles (Crit Goblin, Roll God, Hall of Shame Regular, Battery, Whale Suspect, Book Hoarder…) with runners-up. Winners' titles also show under their name on the Players tab. Needs 2+ players.
- **Quiz tab:** "Guess the owner": 10 rounds of a hidden-owner artifact or build (builds only for characters 2+ players own, so it's not a giveaway). Tracks score, streak and your best score in this browser.

- **Tier list tab:** characters ranked into SS–D tiers by the group's average roll score or crit value.
- **Flex tab:** 5★ constellations, refinements, C6/R5 counts and each player's rarest character.
- **Progress tab:** charts of roll score, crit value, AR, achievements, Abyss and per-character stats over time, plus "glow-ups this week". A snapshot is saved each day the leaderboard loads, and automatically at 06:00 while the app is running (`app.history.snapshot-cron`). Stored in `data/history/`.
- **Wishes tab:** import your wish history for pity, 50/50 win rate, 5★ list and a luck board between accounts (see below).
- **Share card:** on the Characters tab, open a build and click *Share card* to download or copy a PNG of it.

The open tab is part of the address, e.g. http://localhost:8081/#wishes.

## Wish history

1. In Genshin on this PC, open **Wish → History** and let it load.
2. Run `powershell -ExecutionPolicy Bypass -File scripts\get-wish-link.ps1`. It copies your wish history link to the clipboard.
3. Paste it into the Wishes tab and click Import.

The link holds a temporary key (about 24 hours) that can read your wish history, nothing else. The app uses it once and never saves or logs it. It only ever calls HoYoverse's official API, whatever host the pasted link has. Pulls are saved in `data/wishes/{uid}.json` and merged on each import, so history builds up past the game's 6-month limit.

50/50 results assume these standard 5★ characters: Diluc, Jean, Keqing, Mona, Qiqi, Tighnari, Dehya, Yumemizuki Mizuki. If HoYoverse adds one, update `STANDARD_FIVE_STARS` in `WishStats.java`. Capturing Radiance isn't modeled separately.

## Artifact grading

Enka lists every individual substat roll, so roll counts are exact. Each substat scores value ÷ its max single roll (a max-tier Crit DMG roll = 1.0), counted only for stats the character uses:

- Crit Rate and Crit DMG
- their scaling stat (ATK%, HP%, DEF% or EM), inferred from their sands, goblet and circlet main stats
- Energy Recharge, if they run 140%+ ER or an ER sands

Grades per piece: SS ≥ 7, S ≥ 6, A ≥ 4.5, B ≥ 3, C ≥ 1.5, else D. A build's grade uses its total ÷ 5. Rolls into flat HP, ATK or DEF are counted as "wasted".

## Requirements

JDK 21+ and Maven.

## Run

```powershell
mvn spring-boot:run
```

Then open http://localhost:8081. Stop it with **Ctrl+C**.

The first page load downloads about 2 MB of game data (character names, icons and so on) into `data/store/` and refreshes it once a day.

## Notes

- Enka only sees what a player shows on their in-game profile: the characters in their **showcase** (up to 12) with **Show Character Details** turned on. Players without this show up with profile stats only.
- Spiral Abyss and Imaginarium Theater reflect the current period's progress.
- **Crit value** = 2 × Crit Rate + Crit DMG from artifact substats (main stats excluded).
- Profiles are cached for as long as Enka allows (at least 60 seconds), so Refresh won't spam the API. If Enka is down, the last loaded data is shown with a "cached" marker.
- Your friend list is saved in `data/friends.json`.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/leaderboard` | All players with stats and builds |
| GET | `/api/friends` | Saved UIDs |
| POST | `/api/friends` | Add `{"uid": "712345678", "label": "Sam"}`; checks the UID exists first |
| DELETE | `/api/friends/{uid}` | Remove a player |
| GET | `/api/history` | Daily snapshots per player |
| GET | `/api/wishes` | Wish stats for every imported account |
| POST | `/api/wishes/import` | Import `{"url": "<wish history link>"}` |
| DELETE | `/api/wishes/{uid}` | Delete an account's saved wishes |

Settings (port, cache times, data folder) are in `src/main/resources/application.properties`.
