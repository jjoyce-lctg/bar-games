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
2. Tell Claude the account name. Claude will create the repo, push the site, and turn on GitHub Pages. Your pages will be at `https://<account>.github.io/bar-games/`.
3. Later, when you buy a domain, point it at GitHub Pages (Claude will walk through it) and the QR codes will use the short domain automatically.

## 3. First login

The first account created becomes the admin. Open `admin.html` on the hosted site, but first create your admin login in Supabase: **Authentication > Users > Add user**, email `jonathan@djs.lastcallgames.app`, any password, and tick "Auto confirm". Then log in to the admin page with username `jonathan`. From there, add DJ logins under **Logins**, upload logos and set colors under **Bars**.

## Day to day (DJ)

1. Open the site on the laptop connected to the TV, log in, pick the bar.
2. Type tonight's prize, click a game. The TV goes fullscreen with the QR code.
3. Guests scan, pick, enter name and phone, check the opt-in box.
4. Press **Enter** to run the race. Press **Enter** again to go back to the game list.
5. Keys: **F** toggles fullscreen, **Esc** cancels a round. Clicking the screen also advances, for remotes without a keyboard.

## Sending prizes

Admin page > **Entries** > tick "Winners only" + "Not yet texted" > **Export CSV**. Send the texts from your SMS platform, then tick **Texted** on each row. The **SMS list** tab is the de-duplicated opt-in list for general marketing.

## Announcer clips

Recorded MP3s go in `site/announcer/` named by key (send them to Claude as a zip and they get added with the manifest). Keys:

| Key | Line |
|---|---|
| welcome | Ladies and gentlemen, welcome to the Last Call Tavern Games mascot race! Scan the code, pick your racer, and let's go! |
| marks | Racers, to your marks! |
| set | Get set! |
| go | And they're off! |
| lead | We've got a new leader! |
| lead-hotdog / lead-beer / lead-pretzel / lead-pizza | Hot Dog takes the lead! (etc.) |
| down | Oh! Down goes a racer! |
| down-hotdog / down-beer / down-pretzel / down-pizza | Oh no, Hot Dog goes down! (etc.) |
| stretch | Here they come down the stretch! |
| close | It's going to be close! Photo finish! |
| runaway | And they're running away with it! |
| comeback | What a comeback! Look at them go! |
| wins | We have a winner! |
| wins-hotdog / wins-beer / wins-pretzel / wins-pizza | Hot Dog wins it! Hot Dog takes the race! (etc.) |

Keys: M on the console mutes everything. The crowd is generated live and needs no files.

## Crowd and effects (optional recordings)

MP3s in `site/sfx/` replace the generated sounds when present. Keys: `crowd-loop` (20 to 40 s ambient stadium crowd that loops cleanly), `crowd-cheer` (2 to 3 s burst), `crowd-roar` (4 to 6 s big roar), `crowd-ooh` (1 to 2 s groan), `horn` (starting horn), `sting` (victory sting), `beep` (countdown beep).
