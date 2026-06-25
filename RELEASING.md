# Releasing @motisig/expo-motisig-sdk

Maintainers only. This guide covers publishing the npm package to the public registry.

## Prerequisites

1. **npm account** with publish access to the `@motisig` scope.
2. **npm access token** (Automation or Granular Access Token with publish permission).
3. **pnpm** via Corepack (`corepack enable`).
4. Git access to push commits and tags to this repository.

## One-time credential setup

Copy the release env template into a **gitignored** local file (never commit secrets):

```bash
cp .env.release.example .env.release
# Edit .env.release and set NPM_TOKEN=...
```

If your npm account requires 2FA on publish, also set `NPM_OTP` in `.env.release` for the one-time password.

The release script writes a **temporary** `.npmrc` with the token only for the `pnpm publish` call — it is deleted immediately afterward.

## Release checklist

1. **Write release notes** under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
2. **Dry-run** the release to verify steps without side effects:

   ```bash
   scripts/release.sh 1.0.2 --dry-run
   ```

3. **Run the release** (replace the version):

   ```bash
   scripts/release.sh 1.0.2
   ```

   The script will:

   - Bump `version` in [package.json](package.json)
   - Roll `CHANGELOG.md` `[Unreleased]` into the new version with today's date
   - Run `pnpm test`, `pnpm run clean`, and `pnpm run build`
   - Commit `Prepare release X.Y.Z`, create an annotated tag, and publish to npm
   - Push the branch and tag

4. **Verify** on npm:

   ```bash
   npm view @motisig/expo-motisig-sdk version
   ```

## Options

```bash
scripts/release.sh <X.Y.Z> [--dry-run] [--skip-tests] [--remote origin]
```

| Flag | Effect |
|------|--------|
| `--dry-run` | Print every step; no file edits, commits, tags, publish, or push |
| `--skip-tests` | Skip `pnpm test` (use only when you have already verified locally) |
| `--remote <name>` | Git remote to push (default: `origin`) |

## Manual publish (without the script)

```bash
pnpm test
pnpm run clean && pnpm run build
# bump version in package.json and CHANGELOG.md
git commit -am "Prepare release 1.0.2"
git tag -a 1.0.2 -m "Release 1.0.2"
NPM_CONFIG_USERCONFIG=/path/to/temp-npmrc pnpm publish --no-git-checks
git push origin main && git push origin 1.0.2
```

`publishConfig.access` is already `public` in `package.json`; no `--access public` flag is required.
