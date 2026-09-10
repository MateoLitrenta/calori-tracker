# Energy model and activity persistence

Branch: `codex/tdee-activity-persistence`, based on `main` at `5f2bc7b`.
No merge or production deployment was performed.

## Model

All energy calculations live in `src/utils/helpers.ts`. The existing rounded
Mifflin-St Jeor BMR calculation is unchanged. TDEE is rounded BMR multiplied by
activity: Sedentario **1.20**, Moderado **1.375**, Activo **1.55**. Missing or invalid
activity normalizes to Sedentario. Maintenance target equals TDEE; deficit uses
**−400 kcal**, surplus **+300 kcal**.

New helpers: `normalizeActivityLevel`, `getActivityMultiplier`, `calculateTDEE`,
`calculateDailyCalorieTarget`, `getRemainingCalories`, `getRemainingLabel`,
`getWorkoutCalories`, `hasEnergyData`, `getEstimatedEnergyBalance`, `aggregateEnergy`.
`getNetBalance` remains a compatibility alias; `getCaloriesBurned` now accepts
daily TDEE and never adds workouts or steps.

Remaining calories = target − consumed. Historical balance = consumed − TDEE.
Workout calories and steps remain visible, but do not increase either target or
expenditure. Historical estimates use the current profile, since no historical
profile snapshots exist.

Aggregations deduplicate calendar date keys and include one TDEE per recorded
day up to today. Missing/empty days and water/weight-only days retain `Sin datos`;
steps/workout-only days count as energy data, matching the original heatmap rule.
Group colors use average daily balance, while group summaries display total balance.
Charts retain the existing week/four-week/twelve-month windows, average only days
with data, and compute macro targets over those same included days.

## Persistence and migration

Root cause: `syncProfile` omitted activity from its update payload, and
`fetchUserData` omitted activity when rebuilding `UserProfile`. ProfileView then
used its Sedentario fallback after the store fetched the incomplete profile again.

Read-only PostgREST probes on 2026-09-10 returned SQL error `42703` for both
`profiles.activity` and `profiles.activity_level` (zero rows requested). No SQL
schema or migrations were present in the repository. The administrative Supabase
MCP connection returned Unauthorized.

Migration: `supabase/migrations/202609100001_profile_activity_level.sql`.
Apply it **before deploying the application changes**. It adds `activity_level`
with default Sedentario, backfills NULL, sets NOT NULL and constrains allowed
values. It preserves profiles, records and RLS policies, supports repeated
execution, and aborts if an unexpected legacy `activity` column exists rather
than creating duplicate activity data. It does not overwrite non-null values.
The migration was reviewed but **not applied or executed against PostgreSQL**.

Save: `activity_level: normalizeActivityLevel(p.activity)`.
Load: `activity: normalizeActivityLevel(profile.activity_level)`.
Both new-user paths (`fetchUserData` fallback and AuthModal registration) explicitly
persist `activity_level: 'Sedentario'`. The optional activity type is retained.
After a successful save, the store updates the active profile immediately while
preserving the current records; failures reject and do not show a successful save.

## UI and Gemini

- ProfileView shows TMB, TDEE and daily target and recalculates from editing state.
- HomeView passes centralized TDEE/target to DailyPanel and shows loading text
  until a profile is available.
- DailyPanel shows Consumidas, Meta diaria, Restantes/Meta alcanzada/Exceso,
  plus secondary estimated expenditure and separate workout calories.
- Heatmap and group summaries use the shared aggregation policy.
- Charts use the daily target and valid-day averages; explicit chart-column height
  keeps percentage-height bars visible.
- ChatView includes name, weight, TMB, TDEE, persisted activity, goal, daily target,
  consumed/remaining calories, steps and workout calories. It explicitly instructs
  Gemini not to recalculate/replace the application target or add tracked activity.
  Positive remaining calories inform recommendations; negative values indicate excess.
  The existing Gemini API transport is unchanged.

## Validation

`npm test`: **12 passed**, Node 24, no added repository dependencies. The tests cover
cases A–G, invalid activity, missing/empty days, duplicate dates, future dates,
workout/step double counting, new-user defaults, save/load round trips and failure
propagation. Persistence tests execute the actual database functions with a mocked
Supabase boundary; they do not prove production RLS or network behavior.

For male, 70 kg, 170 cm, age 30, the existing rounded TMB is **1618 kcal**:

| Case | Activity/goal | TDEE | Target |
| --- | --- | ---: | ---: |
| A | Sedentario / Mantenimiento | 1942 | 1942 |
| B | Moderado / Déficit | 2225 | 1825 |
| C | Activo / Superávit | 2508 | 2808 |
| D | Missing/invalid activity / Mantenimiento | 1942 | 1942 |

Browser checks used the real UI, store and database mapping functions with an
isolated fake Supabase boundary and a fake Gemini endpoint. Test infrastructure
remained outside the repository. Agent-browser could not activate its browser tab;
checks were completed with the Codex in-app browser.

- A/B/C: profile preview values matched the table.
- Moderado survived save, refresh, navigation away/back and simulated logout/login.
- Activo survived save and refresh; its TDEE and target remained correct.
- E: empty intake showed the full daily target remaining (1825 in case B).
- F: 3200 consumed, target 2808 showed **Exceso 392 kcal**.
- G: a single day with 3200 consumed, 7000 steps and 450 workout kcal produced
  expenditure **2508**, balance **+692** in week, month and year views. No extra
  TDEE was counted for empty calendar days.
- H: the fake endpoint echoed the actual Gemini system instruction: Activo,
  TMB 1618, TDEE 2508, target 2808, consumed 3200, remaining −392, 7000 steps,
  450 workout kcal and the no-recalculation/no-double-counting instructions.
- Profile/dashboard visual style preserved; no browser console errors observed.
- Exact-target and invalid-activity cases were covered by automated tests.

**Not verified in production:** real logout/login persistence after migration,
database constraint execution and a live Gemini response. These require applying
the migration and an authorized test account/server environment. A system prompt
guides Gemini but cannot guarantee every generated response follows it.

`npm run lint`: passes with existing React/hook warnings. The command now scopes
linting to application/API/tests/config files, excluding historical scratch scripts;
the original command failed on syntax errors in `scratch/replace2.cjs` on main.
`npm run build`: passes TypeScript and Vite; bundle-size warning remains.

## File inventory

Modified: `package.json`, `src/utils/helpers.ts`, `src/lib/db.ts`,
`src/hooks/useAppStore.ts`, and components `AuthModal.tsx`, `ProfileView.tsx`,
`HomeView.tsx`, `DailyPanel.tsx`, `Heatmap.tsx`, `ChartsView.tsx`, `ChatView.tsx`.

Created: the SQL migration above, `tests/energy.test.mjs`,
`tests/persistence.test.mjs`, and this validation document.
