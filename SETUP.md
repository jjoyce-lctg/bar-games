# Last Call Tavern Games (LCTG): setup (one time, about 15 minutes)

You create two free accounts and paste a script. Claude does the rest.

## 1. Supabase (database + DJ logins)

1. Go to supabase.com, sign up with jjoyce@lastcalltaverngroup.com, and create a new project. Name it "bar-games". Pick the US East region. Save the database password somewhere (you will not need it day to day).
2. When the project finishes building, open **SQL Editor** in the left menu, click **New query**, paste the entire contents of `supabase/setup.sql`, and click **Run**. It should say "Success".
3. Open **Authentication > Sign In / Providers > Email** and turn **OFF** "Confirm email". (DJ logins use usernames, not real inboxes.)
4. Open **Project Settings > API** and copy two values: **Project URL** and the **anon public** key. Send both to Claude.

That is all for Supabase. Note: the free tier pauses a project after 7 days with no traffic. If that happens, open the dashboard and click Restore. The Pro plan ($25/mo) never pauses.

## 2. GitHub (hosts the web pages)

1. Go to github.com and create an account (or use the group's if one exists).
2. Tell Claude the account name. Claude will create the repo, push the site, and turn on GitHub Pages. Your pages will be at `https://<account>.github.io/bar-games/`. The root page is a public landing page; the staff login lives at `portal.html`. Venue logos are in `site/brand/` (from lastcalltaverngroup.com) and the landing screenshots in `site/shots/`.

Live addresses (custom domain, set up 2026-10-31; the github.io address redirects there): portal `https://lastcalltaverngames.com`, Showrunner `https://lastcalltaverngames.com/showrunner.html`, prize redemption `https://lastcalltaverngames.com/staff.html`, admin `https://lastcalltaverngames.com/admin.html`. DNS is at GoDaddy (four A records to GitHub Pages plus a `www` CNAME to `jjoyce-lctg.github.io`); the domain itself is set under the repo's Settings > Pages with Enforce HTTPS on. QR codes are built from the page's own address, so they use the domain automatically.
3. Later, when you buy a domain, point it at GitHub Pages (Claude will walk through it) and the QR codes will use the short domain automatically.

## 3. First login

The first account created becomes the admin. Open `admin.html` on the hosted site, but first create your admin login in Supabase: **Authentication > Users > Add user**, email `jonathan@djs.lastcallgames.app`, any password, and tick "Auto confirm". Then log in to the admin page with username `jonathan`. From there, add DJ logins under **Logins**, upload logos and set colors under **Bars**.

## Day to day (VJ / DJ)

1. Open the portal on the laptop, log in, choose Showrunner, pick the bar and tonight's prize, click "Go to the TV screen". From here everything on the laptop is safe to mirror to the TVs.
2. The landing screen is "Wanna play a game?" with the QR code live, so guests can scan any time. Up/down arrows pick the game. Press **Enter** to start the clock (default 2 minutes, change it in settings). The race starts when it hits zero, or press **Enter** again to race now. **Esc** stops the clock. During a race, **Esc** aborts it (nothing scored, no prizes). On the landing screen, **Esc** goes back to the bar/prize menu.
3. Race, winner screen (14 s), leaderboard (15 s), then back to the landing screen with a fresh code. **Enter** skips ahead at any point.
4. The key bar at the bottom of the screen shows what each key does. **S** settings (bar, prize, countdown, game, which 4 racers run, mute, log out), **F** fullscreen, **M** mute. Clicking the screen also advances.

## Leaderboards

1 point per play, 10 for backing the winning racer. "Tonight" is per bar, Chicago time. The season board covers all six bars for whichever season includes today; manage seasons in Admin > Leaderboard.

## Sending prizes

Admin page > **Entries** > tick "Winners only" + "Not yet texted" > **Export CSV**. Send the texts from your SMS platform, then tick **Texted** on each row. The **SMS list** tab is the de-duplicated opt-in list for general marketing.

## Announcer clips

Voice: ElevenLabs "David - Sports Arena Announcer" (keep the same voice and settings for every clip). Recorded MP3s go in `site/announcer/` named by key (send them to Claude as a zip and they get added with the manifest). Keys:

| Key | Line |
|---|---|
| welcome | Ladies and gentlemen, welcome to the Last Call Tavern Games mascot race! Scan the code, pick your racer, and let's go! |
| marks | Racers, to your marks! |
| set | Get set! |
| go | And they're off! |
| lead | We've got a new leader! |
| lead-hotdog / lead-beer / lead-pretzel / lead-pizza / lead-dino / lead-skeleton / lead-santa / lead-turkey | Hot Dog takes the lead! (etc.) |
| down | Oh! Down goes a racer! |
| down-hotdog / down-beer / down-pretzel / down-pizza / down-dino / down-skeleton / down-santa / down-turkey | Oh no, Hot Dog goes down! (etc.) |
| stretch | Here they come down the stretch! |
| close | It's going to be close! Photo finish! |
| runaway | And they're running away with it! |
| comeback | What a comeback! Look at them go! |
| wins | We have a winner! |
| wins-hotdog / wins-beer / wins-pretzel / wins-pizza / wins-dino / wins-skeleton / wins-santa / wins-turkey | Hot Dog wins it! Hot Dog takes the race! (etc.) |

Keys: M on the console mutes everything. The crowd is generated live and needs no files.

## Crowd and effects (optional recordings)

MP3s in `site/sfx/` replace the generated sounds when present. Keys: `music-1`, `music-2`, ... (lobby music, plays on the sign-up and leaderboard screens, cycles through the tracks), `crowd-loop` (20 to 40 s ambient stadium crowd that loops cleanly, race only), `crowd-cheer` (2 to 3 s burst), `crowd-roar` (4 to 6 s big roar), `crowd-ooh` (1 to 2 s groan), `gunshot` or `horn` (starting gun), `sting` (victory sting), `beep` (countdown beep).

## Prize redemption (managers)

Managers log in at the portal and choose Prize Redemption (`staff.html`), pick their bar, type the guest's phone number, and tap Redeem. Prizes are created automatically for winners when a race ends, valid from midnight the next day for 14 days, at any LCTG bar, once. Admin > Prizes shows issued, redeemed, outstanding and a CSV export; admins can void a prize. Give manager accounts the Manager role under Admin > Logins. Reconcile: redeemed count per bar should match the LCTG Prize comps in Toast.

## Track themes

Settings (S) > Track theme: Stadium, Halloween, Thanksgiving, Christmas. Each theme is a folder under `site/stadium/` with the same six files as the stadium (far.jpg, wall.png, track-start.jpg, track.jpg, gantry.png, finish-strip.png) plus optional prop-1.png, prop-2.png, prop-3.png placed along the top of the barrier wall. A new theme from the same ChatGPT layout drops in with no engine changes; send the zip to Claude.

## Bar Marbles (second game)

Run `supabase/005_barmarbles.sql` once in Supabase > SQL Editor. It adds the game to the catalog, a place column on entries, the `finish_round_places` and `last_marble_pick` functions, and the new points formula.

How it runs: in the Showrunner, use the up/down keys on the "Wanna play a game?" screen to switch to Bar Marbles. Guests scan, pick a marble colour (returning phone numbers get their last colour by default), enter name and phone. Each entry is a marble with the guest's two-letter tag on it. The race ends when the top 5 are in (or 20 s after the winner); places are recorded, the winner gets the prize exactly like the mascot race, and the results screen holds for 16 s before the leaderboard.

Points: 1 for playing, +10 win, +5 second, +3 third. Need at least 2 marbles to start. Press T on the Bar Marbles landing screen for a demo race with made-up marbles (nothing recorded); D during a race shows the performance overlay (frame rate, where the time goes, render size, which GPU Chrome is using, and the graphics tier in use).

Graphics: Settings (S) has a Graphics choice for Bar Marbles, saved per laptop. Auto (the default) picks Low when Chrome is on Windows' software renderer and High otherwise, and drops to Low on its own if a machine cannot hold about 25 fps. Low has no shadows or antialiasing and starts at 1280 wide; Medium has plain shadows and antialiasing; High has soft shadows. Every tier also scales the 3D render size up and down to hold about 30 fps (never below 800 px wide), so a slow laptop gets a softer picture rather than a stuttering one. The scoreboard and banners are HTML and stay sharp regardless. Physics runs at 120 Hz with no continuous collision detection; that is what keeps a bunched field cheap.

Testing: `test/bmbatch.js` runs headless races and writes fairness stats; `test/bme2e.js` runs the whole sign-up to results flow in mock mode. Press D in `barmarbles-preview.html` for the performance overlay.

## Shell Game (third game)

Migration: run `supabase/006_shellgame.sql` in the SQL Editor (safe to re-run). It adds the game, a `picking` round status with `pick_closes_at`, lets the shell game sign up without a pick, and adds `open_picks` (TV), `shell_pick` (phone) and `pick_counts`.

Flow: guests scan and sign up with name and phone only; their page says to watch the TV and stays open. The DJ presses Enter: the gloves place the ball and shuffle (20 swaps, quick by the sixth, with feints). When the gloves withdraw the TV calls `open_picks` (10 seconds, server clock) and broadcasts "pick" on the round's realtime channel; the TV shows NOW CHOOSE with a phone icon and a countdown, and every open phone shows cup buttons 1, 2, 3 with the same countdown (realtime first, 1 second polling as the fallback, countdown aligned to the server clock). Taps go to `shell_pick`; last tap wins; the server accepts 2 seconds past the close. The TV then waits about 1.5 seconds more, lifts a decoy cup, then the winning cup. `finish_round` with `c1`/`c2`/`c3` tags everyone who picked right as winners, prizes work as for the mascot race, and each phone shows won / not this time. Preview the animation alone at `shellgame-preview.html` (`?seed=`, `?swaps=`, `?pick=`).

Sounds still to make for the Shell Game (`announcer/` clip keys): sg-welcome, sg-set, sg-watch, sg-shuffle, sg-choose, sg-reveal, sg-wins.

## Sounds still to make for Bar Marbles

Same voice (ElevenLabs "David - Sports Arena Announcer"). Until these exist the marbles race plays crowd and SFX only; it never falls back to the mascot-race lines. Keys go in `site/announcer/` and the manifest like the others.

| Key | Line |
|---|---|
| bm-welcome | Welcome to Bar Marbles! Scan the code, pick your marble, and get ready to roll! |
| bm-set | Marbles are set. Gate opens in three... |
| bm-go | And away they go! |
| bm-tornado | Into the tornado! Everybody's back in it! |
| bm-plinko | Into the plinko board! Anyone's race now! |
| bm-ledge | The Ledge! Hold on! |
| bm-off | Oh! That one's off the track! |
| bm-stretch | Down the final straight! |
| bm-wins | We have a winner! |

SFX wanted (short, one-shot, no voice): peg tick, bumper thunk, spinner whirr (loop), hammer whoosh and hit, marble-in-funnel roll (loop), gate clack, marble drop into the trough. Current files: `site/sfx/` and the manifest.
