# My Routine

My Routine is a private wellness journal published at [GitHub Pages](https://ananthapradeep.github.io/habit48/).

## Development and verification

Use Node.js 22 in CI. The local minimum is Node.js 20.19.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright runs the production build at `/habit48/` in desktop and mobile projects. All Supabase requests in the suite are intercepted and served from isolated fixtures. Set `PLAYWRIGHT_EXECUTABLE_PATH` to use an installed Chromium-based browser. GitHub Actions runs the checks and publishes `dist/`.

## Migration audit

The Vanilla deployment is backed up at [codex/backup-vanilla-4d88d60](https://github.com/AnanthaPradeep/habit48/tree/codex/backup-vanilla-4d88d60). Its runtime was a single inline script plus one UI helper and stylesheet, with browser APIs for storage, downloads, printing, and Supabase REST. The workflow previously copied static files and decoded base64 icons.

| Area | Preserved contract |
| --- | --- |
| Journal | Nine ordered habit flags, five meal text fields, five ordered activity metrics, notes, and optional calorie entries. Date keys are local calendar dates in `YYYY-MM-DD`. The selected day can be changed by week, individual day, or date input. Unsaved edits require confirmation before switching days or saving challenge settings. |
| Challenge | `{ start, target, entries }` with target `0` for an unlimited journal. Counts include saved days within the challenge window. Logging continues after a fixed challenge. |
| Food | Existing catalog, aliases, serving assumptions, unknown-food warnings, meal totals, and add/remove/recalculate controls. Saved entries without calorie items can recalculate a display estimate from meal text. Reports use saved calorie items. |
| Analytics | Inclusive date ranges, Monday-start week buckets, calendar months, and averages over logged values. Blank metrics are omitted and zero is counted. Habit percentages use all nine habits. |
| Exports | `my-routine.xlsx` with Journal and Summary sheets, browser print/PDF report, and `my-routine.json` with confirmed restoration. |
| Sign-in | Existing case-insensitive username gate, password grant, owner-account check, token refresh, and local-scope logout. The browser uses the existing publishable Supabase configuration. |
| Cloud | `public.routine_journal` via PostgREST, addressed by authenticated `user_id`, with `payload` and `updated_at`. Authenticated requests use the current bearer token. Writes use a timestamp-guarded PATCH when the row exists and POST otherwise. Independent edits merge, and same-day conflicts prompt for the chosen version. |
| Branding and PWA | Original logo, icons, heartbeat animation, manifest identity and scope, responsive navigation, and theme preference. |

### Browser storage

| Location | Key | Format |
| --- | --- | --- |
| localStorage | `myroutine-v1` | Date-keyed journal. Each day has `h`, `f`, `m`, `notes`, and optional `cal` with `{ meal, name, qty, rate }` items. |
| localStorage | `habit48` | Original start date and ordinal challenge entries. Used when a current journal is absent, with ordinal day 1 mapped to the start date. |
| localStorage | `routine-before-merge` | Journal snapshot before the initial cloud merge. |
| localStorage | `routine-pending` | The string `1` for a saved local change awaiting synchronization. |
| localStorage | `routine-theme` | `light` or `dark`. Absent values follow the system setting. |
| sessionStorage | `routine-session` | Existing authenticated Supabase session representation. |

The journal schema and policies are managed in Supabase. A read-only production metadata query confirmed `user_id uuid`, `payload jsonb`, `updated_at timestamptz`, and enabled RLS with the existing `own_insert`, `own_read`, `own_update`, and `single_owner_only` policies. The frontend migration used the existing project, account, REST endpoints, and bearer-token flow. Verification used isolated fixtures for password login and authenticated reads and writes.

### Implementation

- `src/domain` holds journal types, calendar and challenge rules, the calorie parser, and report aggregation.
- `src/services` holds Supabase session and sync logic and export generation. The sync queue retries compare-and-swap conflicts and rebases edits made during an in-flight write.
- `src/components` and `src/hooks` hold React views and theme behavior. Tailwind utilities complement the existing palette and layout. Lucide provides icons, Recharts renders insights, and Motion animates progress with reduced-motion support.
- `scripts/build-worker.mjs` generates a service worker with a content-derived cache version. Online navigation revalidates HTML. Offline navigation uses the precached shell. Only allowlisted public build assets are precached, and authenticated requests stay outside the worker cache. A tab with an unexpired cached session can reopen the journal offline and sync saved changes on reconnect.

### Live synchronization

Production publishes `public.routine_journal` through `supabase_realtime`. Existing owner RLS applies to both the change subscription and the authenticated REST read. To enable the same feature on another configured Supabase environment, add the table to that environment's publication once.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.routine_journal;
```

Each signed-in client subscribes to INSERT and UPDATE for its user ID. Events trigger a read of the latest row, while saved edits continue through the timestamp-guarded write queue. Duplicate events and echoes of the client's own writes are ignored. Reconnecting or returning to the tab catches up on changes made while away. Incoming state updates leave in-progress journal and challenge edits open, with a conflict choice if the underlying saved data changed.

### Workout Studio

The Workout tab includes a 40-exercise library, original schematic form animations, weekly plans, a rest timer, custom workouts, and history. Exercise detail links point to [NHS exercise videos](https://www.nhs.uk/live-well/exercise/strength-and-flex-exercise-plan-how-to-videos/) or the [ACE Exercise Library](https://www.acefitness.org/resources/everyone/exercise-library/). Estimated expenditure uses your latest recorded weight and broad [Compendium of Physical Activities](https://pacompendium.com/conditioning-exercise/) MET values. It is omitted when there is no recorded weight.

Apply the Workout Studio migration in `supabase/migrations` before deploying the frontend. Owner-only RLS controls sessions, sets, and custom plans. The authenticated, security-invoker RPC writes each finished session and its sets in one transaction and accepts safe retries. Saves and custom plans remain in an account-scoped offline queue until they sync. The open workout draft stays on its device. Completed workouts and custom plans sync through authenticated Realtime and REST.

Journal and Insights show separate Studio summaries. Workouts do not add to manually entered activity minutes, food calories, or the existing journal exports.

### Rollback

Revert the migration commit on `main` and push the revert. This restores the previous Pages build workflow and republishes the Vanilla app.

```sh
git switch main
git pull --ff-only origin main
git log --oneline --grep="Migrate My Routine to React"
git revert <migration-commit>
git push origin main
```

Wait for the Pages workflow to succeed and reload the production URL while online so the browser can pick up the restored worker. Keep browser storage intact. Both versions read the same journal and session keys, and the backup branch provides the exact pre-migration source.
