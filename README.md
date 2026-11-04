# Om Team Register

A Google Sheet plus one phone-friendly web link for Om Textiles' employees and team leads.
Staff use the link in Hindi or English; they never get the sheet. Admins review and edit in
the sheet or in the admin screens of the same link.

Plan: [Om Textiles Team Register: Plan](https://claude.ai/artifact/HuLea1k3jbPJ9DpEbkqKep)

**Built so far:** Phase 1 (people records, sign-in, joining form with photos, change requests,
team members for team leads, "report a problem", admin review queue) and Phase 2 (attendance).
Money, salary and payslips (Phase 3) come next.

## Folders

| Folder | What it is |
| --- | --- |
| `app/` | The main Apps Script project, bound to the sheet. Paste these files into it. |
| `signin/` | A tiny separate Apps Script project used only for "Sign in with Google". |
| `test/` | Node checks that run the Apps Script code against a fake sheet (`node test/run.js`) and drive the page in a browser (`node test/ui.js`). |

## Tabs

| Tab | One row per |
| --- | --- |
| People | Employee or team lead (team leads are contractors; staff pages never use that word) |
| Team members | Member of a team lead's team |
| Requests | Change request or reported problem, with the admin's answer |
| Admins | Admin Gmail, active yes/no, scrambled PIN |
| Settings & words | Settings, and every screen word in English and Hindi. Change wording here. |
| Audit log (hidden) | Every change made through the app: who, when, old and new value |
| Attendance | Employee per day: P / A / H (half) / L (leave) / WO (Sunday) / HOL, OT (0.5 or 1 day), in and out time and location |
| Team attendance | A team lead's member per day, for record only, never used for pay |
| Holidays | Date and name. Type holidays here; they show as HOL by default |
| Attendance month | Read-only grid for one month with totals. `Om Team > Refresh attendance month` |

## One-time setup (about 20 minutes)

1. Create a new Google Sheet, name it e.g. `Om Team Register`. Keep it private; share it only with admins.
2. `Extensions > Apps Script`. In `Project Settings`, tick *Show "appsscript.json" manifest file*,
   then paste `app/appsscript.json`.
3. Add the files from `app/`: `Setup.gs`, `Data.gs`, `Auth.gs`, `Words.gs`, `People.gs`,
   `Admin.gs`, `Attendance.gs`, `WebApp.gs` (`File > + > Script`, drop the `.gs`), and `App` (`File > + > HTML`,
   the name must be exactly `App`).
4. Save. Run `setupWorkbook` once and approve the permission prompt. It makes the tabs, the
   private Drive folder for documents, and the signing secret.
5. On the **Admins** tab add a row: your Gmail, your name, Active `yes`. Reload the sheet, then
   `Om Team > Set my admin PIN`. Each admin does this step with their own Google account.
6. `Deploy > New deployment > Web app`. Execute as: **Me**. Who has access: **Anyone**.
   Copy the **Web app URL** (ends in `/exec`), then in the sheet run `Om Team > Show app link`
   and paste it. The app uses this saved link everywhere; Google's own guess can point at the
   test version, which shows "Sorry, unable to open the file at this time".

### Google sign-in (needed for admins, optional for staff)

7. Go to [script.google.com](https://script.google.com) and create a **new, separate** project,
   named `Om Team Sign-in`. Show the manifest as in step 2 and paste `signin/appsscript.json`.
   Paste `signin/Code.gs` into `Code.gs`, and add an HTML file named `Page` with `signin/Page.html`.
8. `Deploy > New deployment > Web app`. Execute as: **User accessing the web app**. Who has
   access: **Anyone with a Google account**. Copy its link.
9. Back in the sheet: `Om Team > Connect Google sign-in`. Leave the first box empty to keep
   the app link from step 6, then paste the Sign-in link. The dialog shows two
   values, `SECRET` and `APP_URL`. In the Sign-in project, `Project Settings > Script properties`,
   add both.
10. Open the app link, tap **Sign in with Google**, then enter your admin PIN.

The first time someone uses Google sign-in, Google shows a warning that the app is not
verified (because it is your own private script). Tap *Advanced > Go to Om Team Sign-in*. It
only asks to see their email address.

**If Google sign-in goes wrong:**

| What you see | Fix |
| --- | --- |
| "Sorry, unable to open the file at this time" after Continue | `APP_URL` in the Sign-in project is not the main app's live link. Copy it from the main project's `Deploy > Manage deployments`. |
| Continue keeps showing the "Signed in with Google as…" page | `APP_URL` is the Sign-in project's own link. Set it to the main app's link. |
| "This Google account is not linked to anyone" | Add the Gmail to the Admins tab (admins) or to Login Gmail on People (staff). |

The two links have different `AKfycb…` parts; the main one belongs to the project you open
from the sheet (`Extensions > Apps Script`).

After changing any script file: `Deploy > Manage deployments > Edit > Version: New version`, so
the link picks up the change.

## Adding people

- **Joining link:** `Om Team > Make a joining link` (or the admin screen's *Joining link* tab).
  It works for 7 days and for any number of people. They fill six short steps, take photos of
  Aadhaar and PAN, choose a PIN and tick consent. The record lands as *Pending review*.
- **Admin fills it with them:** admin screen > *Add person*. Same form.
- **Straight in the sheet:** add a row on People with Status `Active`, then select the row and
  `Om Team > Set PIN for selected person`. They change the PIN on first sign-in.

Staff sign in with **Mobile 1 and their PIN**, or with Google if their Gmail is in *Login Gmail*
or *Email*.

## Admins

- Add an admin: a row on Admins with their Gmail and Active `yes`, share the sheet with them,
  and they run `Om Team > Set my admin PIN`. Remove: set Active `no`.
- Review queue: new joiners and open requests. Approving a detail change writes it to People;
  approving a team change adds or removes the member. Rejecting needs a short reply, which the
  person sees in *My requests*.
- Attendance, salary and advance problems are answered with a reply for now; the fixes
  themselves come with Phases 2 and 3.
- *Reset PIN* makes a new 4-digit PIN, shown once.
- Admins get an email for each new joiner and each locked login (turn off with
  `setting.alertAdmins` = `no`).

## Attendance

- **Employees** see two big buttons on their home screen: *I have arrived* and *Going home*. The
  time is saved, and the location too if the phone allows it (nothing is blocked if not).
  The first arrival of the day is kept. With `setting.autoCheckIn` = `yes`, the arrival is saved
  as soon as they open the app each day.
- Their own taps count only as "waiting for supervisor" unless *Self check-in* is `yes` on their
  People row.
- **Supervisors** (*Supervisor* = `yes` on People) get *Mark attendance*: everyone listed for a
  date, already set to Present (Sundays WO, holidays HOL). One tap per person changes it; OT is
  a half or full extra day. They may mark today and the last 7 days (`setting.markDaysBack`).
  Admins mark any past day from the admin *Attendance* tab.
- **My attendance** shows a month calendar with colours and totals. Dashed days are waiting for
  the supervisor.
- **Attendance problems** come into the review queue with the day as it stands now. The admin
  picks the right status and OT and taps *Set this day and approve*.
- **Team leads** get *Team attendance* for their own members: Present / Absent / Half day, for
  record only.
- About 50 people × 365 days is ~18,000 rows a year. Move old years to another sheet once a year
  to keep the app quick.

## Voice

Every free-text box has a 🎤 button using the phone's speech recognition (Hindi or English,
following the language switch). Some phones block the microphone inside Apps Script pages; the
button then tells people to use the mic key on the Google keyboard (Gboard), which always works.
Numbers (mobile, Aadhaar, bank account) open the number keypad instead.

## Security

- The app link runs as the owner and is open to anyone, so every call carries a signed session
  (12 hours, `setting.sessionHours`). People who are set to Left or Rejected are signed out.
- PINs are stored salted and hashed. 5 wrong PINs lock that login for 15 minutes.
- Staff see only their own record, with Aadhaar, PAN and bank numbers masked to the last 4.
- Photos are in a private Drive folder owned by the sheet owner, one sub-folder per person.
- Keep the `SECRET` script property private: anyone with it can sign in as anyone.

## Checks

```sh
node test/run.js   # flows against a fake sheet
node test/ui.js    # screenshots of the main screens (needs Playwright + Chromium)
```
