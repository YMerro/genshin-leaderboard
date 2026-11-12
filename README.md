# Genshin Friends Leaderboard

A small web app that ranks you and your friends by Genshin Impact profile stats, using the public [Enka.Network API](https://api.enka.network). Add players by UID. Anyone with the link can view; adding or removing players needs the [admin password](#admin-password).

- **Players tab:** rank by Spiral Abyss, Imaginarium Theater, Adventure Rank, achievements or best crit value. Click a player to see their showcase characters.
- **Characters tab:** compare everyone's builds side by side, overall or for one character, ranked by roll score, crit value, ATK, HP, DEF, EM, Energy Recharge, crit rate, crit DMG or DMG bonus. Click a build to see its 5 artifacts.
- **Artifacts tab:** Hall of Fame (best rolled +20 artifacts in the group) and Hall of Shame (fewest useful rolls).
- **Head-to-head tab:** pick two players and compare profile stats and shared characters, with a running score.
- **Awards tab:** 14 auto-awarded titles (Crit Goblin, Roll God, Hall of Shame Regular, Battery, Whale Suspect, Book Hoarder…) with runners-up. Winners' titles also show under their name on the Players tab. Needs 2+ players.
- **Quiz tab:** 10 random questions per game in five modes: *Mixed*, *Guess the owner* (whose artifact/build is this), *Account trivia* (who has the higher Abyss/AR/CV, which weapon or set someone's character uses, constellations, signatures, plus wish questions like last 5★, 50/50 results and pity when wishes are imported), *Lore & fun facts* (titles, redacted character bios, birthdays, affiliations, star constellations, constellation and talent names, specialty dishes, voice actors and weapon descriptions from [genshin-db](https://github.com/theBowja/genshin-db), leaning toward characters your group owns, plus ~45 hand-written easter eggs) and *Icon quiz* (whose skill/burst/passive/constellation icon is this, what is it called, what kind of talent is it, plus weapon icons, artifact pieces and character name cards). Question types rotate, nothing repeats within a game, answers are shuffled, and each answer shows the real values. Best score per mode is kept in this browser.

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

The first page load downloads about 2 MB of game data (character names, icons and so on) into `data/store/` and refreshes it once a day. The quiz's lore data comes from genshin-db and is cached in `data/lore/` for a week.

To add or remove players during development, give it a password: `mvn spring-boot:run -Dspring-boot.run.arguments=--app.admin.password=dev`.

## Admin password

Viewing everything is open to anyone with the link, and so are wish imports (one at a time, so nobody can flood HoYoverse). These need the admin password:

- adding and removing players
- deleting saved wish history

Click **Admin** in the page header (or just try one of those actions) and enter the password. It's remembered in that browser; click **Admin ✓** to log out. After 20 wrong passwords in 10 minutes, admin actions are locked for 10 minutes.

Set the password **outside the repo**, as `app.admin.password` in `config/application.properties` next to the jar (the installer below does this), or with the `APP_ADMIN_PASSWORD` environment variable. With no password set, admin actions are disabled.

## Run in the background on Windows

```powershell
mvn package
powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1
```

This sets up `%USERPROFILE%\GenshinLeaderboard`:

| Path | |
|---|---|
| `app\genshin-leaderboard.jar` | The app |
| `config\application.properties` | Data folder, port and a **generated admin password** (open the file to see it) |
| `data\` | Friends, history, wishes and lore. Copied from the project's `data\` the first time. **Back this up.** |
| `logs\` | `app.log` (rotated) and `launcher.log` |
| `start.ps1` / `stop.ps1` | Start in the background (restarts itself if it crashes) / stop |
| `update.ps1` | Rebuild from the project and restart; data and settings are kept |

Running the installer again is safe: existing data and settings are kept. Don't run `mvn spring-boot:run` on port 8081 at the same time; use `--server.port=8082` for a development copy.

### Start and stop for this session only

Turn it on now (runs hidden in the background until you stop it, sign out or restart the PC):

```powershell
powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\GenshinLeaderboard\start.ps1
```

It returns right away and the app keeps running in the background. Give it about 15 seconds, then open http://localhost:8081. If it doesn't come up, check `%USERPROFILE%\GenshinLeaderboard\logs\launcher.log` and `app.log`.

Turn it off:

```powershell
powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\GenshinLeaderboard\stop.ps1
```

- Use these from any folder; they live in the install folder, not in the project. You can also right-click them there and choose **Run with PowerShell**.
- Don't end it from Task Manager: while it's running it restarts itself after a crash, so it would come back after 15 seconds. `stop.ps1` stops it for good.
- Nothing here changes auto-start: with auto-start disabled, the app stays off after a restart until you run `start.ps1` again.

### Desktop shortcuts

Double-click instead of typing commands:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\shortcuts.ps1 create   # Start / Stop / Open Leaderboard on the Desktop
powershell -ExecutionPolicy Bypass -File scripts\windows\shortcuts.ps1 remove
```

The shortcuts are created on each PC, not stored in git, because they contain paths specific to that user. They don't touch auto-start.

### Auto-start at sign-in

Off by default. Turn it on or off per PC with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\autostart.ps1 enable    # start at every Windows sign-in
powershell -ExecutionPolicy Bypass -File scripts\windows\autostart.ps1 disable   # stop doing that
powershell -ExecutionPolicy Bypass -File scripts\windows\autostart.ps1 status    # check
```

It only adds or removes a shortcut in your Startup folder; it doesn't start or stop the app right now (use `start.ps1` / `stop.ps1` for that). You can also pass `-AutoStart` to `install.ps1`.

To make it reachable from the internet, a tunnel such as [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) (free, stable HTTPS address) can point at port 8081. Only do this on a PC you own and are allowed to expose; not on a work computer.

## Docker and Kubernetes

The app runs as a container too. CI builds and tests everything; nothing is needed locally.

**Docker**

```bash
ADMIN_PASSWORD=choose-one docker compose up -d --build   # http://localhost:8081, data in the leaderboard-data volume
```

The image (multi-stage, JRE 21 Alpine, non-root user 10001) stores data in `/data` and is configured with environment variables: `APP_ADMIN_PASSWORD`, `APP_DATADIR`, `SERVER_PORT`. Health: `/actuator/health/liveness` and `/actuator/health/readiness`.

**Kubernetes** (Kustomize, in `deploy/k8s/`)

```bash
kubectl create namespace leaderboard
kubectl -n leaderboard create secret generic leaderboard-admin --from-literal=password=choose-one
kubectl -n leaderboard apply -k deploy/k8s/base
kubectl -n leaderboard port-forward svc/leaderboard 8081:80
```

- One replica with a `Recreate` strategy and a 1 Gi PVC on `/data`: the data is JSON files and the daily snapshot is an in-app job, so two pods must never run at once. Scaling out would need a database first.
- Hardened pod: non-root, read-only root filesystem, no capabilities, startup/liveness/readiness probes, memory limit with `MaxRAMPercentage`.
- `base/ingress.example.yaml` is a template for exposing it with an ingress controller.

**CI** (`.github/workflows/ci.yml`): on every push it runs the tests, lints the Dockerfile (hadolint) and renders the manifests, builds the image, scans it with Trivy, deploys it to a throwaway **kind** cluster and checks the health endpoints. On `main` it then pushes `ghcr.io/ymerro/genshin-leaderboard:latest` and `:sha-<commit>`.

## Notes

- Enka only sees what a player shows on their in-game profile: the characters in their **showcase** (up to 12) with **Show Character Details** turned on. Players without this show up with profile stats only.
- Spiral Abyss and Imaginarium Theater reflect the current period's progress.
- **Crit value** = 2 × Crit Rate + Crit DMG from artifact substats (main stats excluded).
- Profiles are cached for as long as Enka allows (at least 60 seconds), so Refresh won't spam the API. If Enka is down, the last loaded data is shown with a "cached" marker.
- Your friend list is saved in `data/friends.json`.

## API

🔒 = needs the admin password in the `X-Admin-Password` header.

| Method | Path | |
|---|---|---|
| GET | `/api/leaderboard` | All players with stats and builds |
| GET | `/api/friends` | Saved UIDs |
| POST 🔒 | `/api/friends` | Add `{"uid": "712345678", "label": "Sam"}`; checks the UID exists first |
| DELETE 🔒 | `/api/friends/{uid}` | Remove a player |
| GET | `/api/history` | Daily snapshots per player |
| GET | `/api/wishes` | Wish stats for every imported account |
| POST | `/api/wishes/import` | Import `{"url": "<wish history link>"}` (one at a time) |
| DELETE 🔒 | `/api/wishes/{uid}` | Delete an account's saved wishes |
| GET | `/api/characters` | Name, element, weapon, rarity and icon of every playable character |
| GET | `/api/lore` | Character and weapon lore used by the quiz |
| GET 🔒 | `/api/admin/check` | Returns 204 if the password is right |

Default settings (port, cache times, data folder) are in `src/main/resources/application.properties`; override them in `config/application.properties` next to the jar.
