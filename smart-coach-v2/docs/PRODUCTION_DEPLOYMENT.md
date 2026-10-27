# Zummith V2 production handoff

Prepared on 2026-10-26 for a teammate deploying from this repository.
Scope: replace the frontend on the existing Netlify site for `https://zummith.com` while retaining the existing backend.

## Release status and known risks

The owner has requested that the project remain as it is for this handoff. This is deployment preparation, not a security sign-off or a record of a completed deployment.

Production metadata inspected on 2026-10-26 confirmed three unresolved high-priority backend authorization defects:

- A coach can change authorization fields on their own profile, including assigning the `admin` role.
- An independent-client portal association can be self-created without verifying the client's actual account identity. The active paid-coach check does not establish that identity. The resulting client authorization is also used for updates and deletion.
- Authenticated users can overwrite or delete other tenants' objects in the `assets` bucket through Storage because its write policies do not check ownership or gym context.

Leaked-password protection is disabled. The repository's Netlify configuration also has no anti-framing headers. These items remain unresolved in this handoff. No exploit was executed against production and no customer records were inspected in the metadata audit.

The frontend build preserves these existing backend rules. Coordinate the release decision with the owner; a successful build does not establish that these risks were fixed. Server hardening is separate work.

Local preparation checks passed on 2026-10-26 using Node `22.19.0`: both offline backend checks, all 12 contract tests and `npm run build:release`. The browser output contains the production backend and session key, no staging backend configuration, no source maps, and the SPA fallback. The build reported size warnings for the initial bundle (755.55 kB versus a 750 kB warning budget) and routine stylesheet (33.37 kB versus 32 kB); both remained below their error budgets. Netlify settings and published-domain checks have not been executed remotely in this preparation.

## Production settings already in the repository

| Setting | Value |
| --- | --- |
| Application directory | `smart-coach-v2` |
| Node version | `22.19.0`, from `.nvmrc` and `netlify.toml` |
| Application URL | `https://zummith.com` |
| Supabase project | `bzhqprxolseyxuuwodqs` |
| Supabase API | `https://bzhqprxolseyxuuwodqs.supabase.co` |
| Browser session storage key | `zummith-auth` |
| Production environment file | `src/environments/environment.prod.ts` |
| Release build command | `npm run build:release` |
| Publish directory, relative to the application directory | `dist/smart-coach-v2/browser` |
| Netlify configuration | `smart-coach-v2/netlify.toml` |

Angular's default build configuration is `production`. It replaces `environment.ts` with `environment.prod.ts`, uses hashed bundles, and produces the browser files above. Development, staging and local-testing builds are separate configurations.

The browser uses the public Supabase key already committed in the production environment file. No additional Netlify secret is required by this frontend. Never put a `service_role`, secret API key, database password or Firebase admin credential in an Angular environment or public build variable.

Keep the existing domain and Supabase Auth configuration, including Google and email callbacks. Preserving `zummith-auth` on the same origin allows V2 to use existing sessions; changing the domain creates a different browser storage origin.

## Obtain the source and verify the revision

1. Clone the complete repository using the repository URL supplied by the owner, or update an existing clean clone.
2. Check out the exact release commit shared by the owner. The preparation branch is `maikol-branch`; confirm the intended commit rather than assuming the default branch is the release.
3. Confirm the working tree and source revision:

   ```sh
   git status --short
   git rev-parse HEAD
   ```

4. Preserve the repository layout, including both `smart-coach-v2/` and `smart-coach/`. The release validators import the original application's environment and session settings and inspect its source. Copying only the V2 directory cannot run the existing release checks.

`node_modules/`, `dist/` and local caches are generated and ignored by Git. The teammate or Netlify rebuilds them from `package-lock.json`. Keep the tracked `smart-coach-v2/public/` assets, including exercise WebP images, branding and icons.

## Install, check and build locally

Start in the repository root. These commands use Bash and `nvm`:

```sh
cd smart-coach-v2
nvm install
nvm use
node --version
npm ci
npm run test:original-backend-contract
npm run build:release
```

If `nvm` is unavailable, install Node `22.19.0` with the team's normal tooling before running the npm commands. Keep the committed lockfile; do not upgrade dependencies as part of this handoff.

The Angular build tools are dev dependencies. The build environment must install them; remove any inherited install flag that omits dev dependencies before building.

`build:release` runs the offline backend configuration check, checks V2's calls against the saved original-backend contract, and then builds production. It does not connect to Supabase or apply database changes. The saved contract is a compatibility snapshot dated 2026-10-10; it does not establish current backend security.

After a successful build, confirm that `dist/smart-coach-v2/browser/index.html` and `dist/smart-coach-v2/browser/_redirects` exist. Publish that browser directory, including its assets. Do not publish the repository root, the source directory or the parent `dist` folder containing multiple builds.

## Configure the existing Netlify site

Before changing build settings, record the currently published deploy ID and the site's current base directory, package directory, build command, publish directory and Node setting. Keep the previous successful deploy available for rollback.

Use the existing site that owns `zummith.com`. Configure its build settings as follows:

| Netlify setting | Value |
| --- | --- |
| Base directory | `smart-coach-v2` |
| Package directory | Unset, or `smart-coach-v2` if an existing value must be specified |
| Build command | `npm run build:release` |
| Publish directory | `dist/smart-coach-v2/browser` |
| Node version | `22.19.0` |
| Source revision | The release commit agreed with the owner |

Remove an old package-directory override pointing at `smart-coach`; otherwise Netlify may discover the old application's configuration first. With the V2 base directory, Netlify installs dependencies and runs the command inside V2 while the sibling original application remains available in the repository checkout. The publish path is relative to that base directory. See [Netlify's monorepo configuration documentation](https://docs.netlify.com/build/configure-builds/monorepos/).

Confirm that the build log uses `smart-coach-v2/netlify.toml` and the production environment. V2 has no runtime dependency on the legacy Firebase/Netlify Functions directory. Keep existing remote secrets private and do not copy them into the frontend.

The SPA fallback `/* /index.html 200` is present in `public/_redirects` and the Netlify configuration. It must remain available so direct navigation and refresh on application routes work.

A preview built with the production configuration connects to the real production backend. Use approved accounts and avoid unintended writes. Google and email callbacks may return to the canonical production domain; a preview alone cannot validate the final callback flow.

Publish the agreed revision through the site's normal release process after the owner authorizes the cutover. Pushing to a configured production branch may trigger automatic publication; check that behavior before pushing or changing the site's source settings.

## Keep backend operations outside this release

Do not run `supabase db push`, apply migrations, execute seed scripts, enable `ALLOW_PRODUCTION_MUTATIONS`, or run `npm run test:production-mutations` for this frontend release. Do not change policies, roles, accounts, portal links or Storage buckets to make the deployment succeed.

The additional local migrations are excluded from this frontend cutover. See [BACKEND_REPLACEMENT.md](BACKEND_REPLACEMENT.md) for the historical compatibility inventory and migration boundaries. Existing staging/local integration suites may expect a different server schema; they are not production deployment commands.

## Check the published frontend

Use accounts and any test writes explicitly agreed with the owner:

1. Open `https://zummith.com/login` and refresh a nested application route. Both must load the SPA without a Netlify 404.
2. Verify an existing coach session, fresh sign-in, sign-out and the correct landing screen for the account.
3. Check an existing client, routine and gym context. Confirm that the browser contacts the expected production Supabase host, with no localhost or staging backend requests.
4. Download a routine PDF and confirm that exercise thumbnails, notes and links are present.
5. Check the client portal and administrative navigation with representative accounts. Functional checks do not close the authorization defects listed above.
6. Verify Google login and an email recovery callback using the agreed test account on the final domain.
7. Check the browser console and failed network requests. Record the deployed commit, deploy ID, date and observed results.
8. Check the Zummith favicon and share preview. The initial HTML includes Open Graph and large-image card metadata; `https://zummith.com/brand/zummith-og.png?v=2` must return the public PNG (2400 × 1260), and the favicon assets must load. Keep these files in the release. Link-preview services may cache previous responses; request a refresh with the relevant platform's preview debugger after publication if needed. This is a site-wide brand preview, without client or routine data.

## Roll back the frontend

If the new frontend fails, open the previous successful deploy on the same Netlify site and use **Publish Deploy**. Netlify supports [republishing an existing deploy](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#rollbacks) without rebuilding it.

Prevent a subsequent automatic build from immediately replacing the rollback, following the team's normal deployment controls. Restore the captured source/build settings if they were changed for the cutover. Confirm sign-in and nested-route refresh again.

A frontend rollback does not undo data saved after cutover and does not change the backend security defects. No database rollback is part of this handoff.
