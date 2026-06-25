#!/bin/sh
# Full npm release helper for @motisig/expo-motisig-sdk.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION=""
DRY_RUN=0
SKIP_TESTS=0
REMOTE="origin"
TMP_NPMRC=""
CRED_SOURCE=""

cleanup() {
  if [ -n "$TMP_NPMRC" ] && [ -f "$TMP_NPMRC" ]; then
    rm -f "$TMP_NPMRC"
  fi
}
trap cleanup EXIT INT TERM

usage() {
  cat <<'EOF'
Usage: scripts/release.sh <X.Y.Z> [--dry-run] [--skip-tests] [--remote <name>]

Full npm release:
  1. Bump version in package.json
  2. Roll CHANGELOG [Unreleased] into the new version
  3. Run tests and build
  4. Commit, annotated tag, publish to npm, push

Credentials (first match wins):
  - NPM_TOKEN in gitignored .env.release or the environment
  - npm login session in ~/.npmrc (npm whoami succeeds)
EOF
  exit "${1:-0}"
}

log() {
  printf '%s\n' "$*"
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] $*"
  else
    log "+ $*"
    "$@"
  fi
}

validate_semver() {
  case "$1" in
    [0-9]*.[0-9]*.[0-9]*)
      case "$1" in
        *[!0-9.]*)
          log "error: invalid semver (digits and dots only): $1" >&2
          exit 1
          ;;
      esac
      ;;
    *)
      log "error: invalid semver: $1" >&2
      exit 1
      ;;
  esac
}

current_version() {
  sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json | head -n 1
}

roll_changelog() {
  local version="$1"
  local date
  date="$(date +%Y-%m-%d)"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] roll CHANGELOG [Unreleased] -> [$version] - $date"
    return 0
  fi

  if [ ! -f CHANGELOG.md ]; then
    cat > CHANGELOG.md <<'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
when version tags are published.

EOF
  fi

  if ! grep -q '^## \[Unreleased\]' CHANGELOG.md; then
    {
      head -n 7 CHANGELOG.md
      echo
      echo "## [Unreleased]"
      echo
      tail -n +8 CHANGELOG.md
    } > CHANGELOG.md.tmp
    mv CHANGELOG.md.tmp CHANGELOG.md
  fi

  awk -v ver="$version" -v dt="$date" '
    /^## \[Unreleased\]/ {
      print "## [Unreleased]"
      print ""
      print "## [" ver "] - " dt
      next
    }
    { print }
  ' CHANGELOG.md > CHANGELOG.md.tmp
  mv CHANGELOG.md.tmp CHANGELOG.md
}

bump_package_version() {
  local new_version="$1"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] bump package.json version -> $new_version"
    return 0
  fi

  sed "s/\"version\": \"[^\"]*\"/\"version\": \"${new_version}\"/" package.json > package.json.tmp
  mv package.json.tmp package.json
}

resolve_npm_credentials() {
  local file="$ROOT/.env.release"

  if [ -f "$file" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      log "[dry-run] source .env.release (NPM_TOKEN and optional NPM_OTP)"
    fi
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
  fi

  if [ -n "${NPM_TOKEN:-}" ]; then
    CRED_SOURCE="token"
    if [ "$DRY_RUN" -eq 1 ]; then
      log "[dry-run] npm auth: NPM_TOKEN from .env.release or environment"
    fi
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    if npm whoami --registry=https://registry.npmjs.org/ >/dev/null 2>&1; then
      log "[dry-run] npm auth: npm login credentials (~/.npmrc)"
    else
      log "[dry-run] npm auth: none found (would fail; run npm login or set NPM_TOKEN)"
    fi
    return 0
  fi

  if npm whoami --registry=https://registry.npmjs.org/ >/dev/null 2>&1; then
    CRED_SOURCE="npm-login"
    log "Using npm login credentials (~/.npmrc)."
    return 0
  fi

  log "error: no npm publish credentials found." >&2
  log "Run npm login, or copy .env.release.example to .env.release and set NPM_TOKEN." >&2
  exit 1
}

publish_to_npm() {
  publish_args="--no-git-checks"
  if [ -n "${NPM_OTP:-}" ]; then
    publish_args="$publish_args --otp $NPM_OTP"
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] pnpm publish --no-git-checks"
    if [ -n "${NPM_OTP:-}" ]; then
      log "[dry-run] with --otp <redacted>"
    fi
    return 0
  fi

  if [ "$CRED_SOURCE" = "token" ]; then
    TMP_NPMRC="$(mktemp)"
    printf '%s\n' "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "$TMP_NPMRC"
    # shellcheck disable=SC2086
    NPM_CONFIG_USERCONFIG="$TMP_NPMRC" pnpm publish $publish_args
  else
    # shellcheck disable=SC2086
    pnpm publish $publish_args
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --remote)
      shift
      REMOTE="${1:?--remote requires a value}"
      ;;
    -h|--help) usage 0 ;;
    -*)
      log "error: unknown option: $1" >&2
      usage 1
      ;;
    *)
      if [ -n "$VERSION" ]; then
        log "error: unexpected argument: $1" >&2
        usage 1
      fi
      VERSION="$1"
      ;;
  esac
  shift
done

[ -n "$VERSION" ] || usage 1
validate_semver "$VERSION"

if git rev-parse "$VERSION" >/dev/null 2>&1; then
  log "error: git tag $VERSION already exists." >&2
  exit 1
fi

OLD_VERSION="$(current_version)"
if [ "$OLD_VERSION" = "$VERSION" ]; then
  log "error: package.json version is already $VERSION; choose a higher version." >&2
  exit 1
fi

log "Releasing @motisig/expo-motisig-sdk $OLD_VERSION -> $VERSION"
roll_changelog "$VERSION"
bump_package_version "$VERSION"

if [ "$SKIP_TESTS" -eq 0 ]; then
  run pnpm test
else
  log "Skipping tests (--skip-tests)."
fi

run pnpm run clean
run pnpm run build

run git add CHANGELOG.md package.json
run git commit -m "Prepare release $VERSION"
run git tag -a "$VERSION" -m "Release $VERSION"

resolve_npm_credentials
publish_to_npm

CURRENT_BRANCH="$(git branch --show-current)"
run git push "$REMOTE" "$CURRENT_BRANCH"
run git push "$REMOTE" "$VERSION"

log ""
log "Published @motisig/expo-motisig-sdk@$VERSION to npm."
if [ "$DRY_RUN" -eq 1 ]; then
  log ""
  log "Dry run complete. No files, commits, tags, publishes, or pushes were changed."
fi
