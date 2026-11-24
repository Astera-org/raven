#!/usr/bin/env bash
# shellcheck disable=SC2016 # Backticks in single-quoted printf strings are Markdown.
set -euo pipefail

REMOTE="${RELEASE_REMOTE:-origin}"
BRANCH="${RELEASE_BRANCH:-main}"
CLI_DIR="cli"
CLI_ENTRY="src/index.ts"
OUT_DIR="dist/release"
MIN_NODE_MAJOR=24
DEFAULT_TARGETS="darwin-arm64 darwin-x64 linux-x64 linux-arm64 windows-x64"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: scripts/release.sh <command> [arguments]

Releases the whole monorepo as one version. A release is a vX.Y.Z tag on main's
HEAD plus a GitHub release carrying the CLI twice: as an npm-installable tarball
and as standalone executables compiled with Bun. Nothing is committed: the
version is written into cli/package.json only while building, then restored.

Commands:
  create <version> [--dry-run]
      Check the repository and GitHub, test, build and smoke-test everything,
      then tag and push vX.Y.Z and open a draft release with all of it.
      --dry-run does every check and build, and stops before tagging.
  build [<version>] [--target <target>]...
      Build and smoke-test from the checkout as it is: any branch, unpushed or
      uncommitted changes, no GitHub access. Skips the repository checks and the
      CLI's typecheck and tests. The version defaults to cli/package.json's.
  publish <version>   Publish the draft release.
  undo <version>      Delete the release and its tag (remote and local).
  purge               Delete every vX.Y.Z release and tag.

Versions look like 0.2.0, or 0.2.0-rc.1 for a prerelease.

Targets are Bun's, without the "bun-" prefix. Releases build
darwin-arm64 darwin-x64 linux-x64 linux-arm64 windows-x64. `build` also takes
linux-x64-musl, linux-arm64-musl, windows-arm64, and -baseline x64 variants.

Needs Node.js 24+, pnpm, Bun, and for create/publish/undo/purge an authenticated gh.

Environment:
  RELEASE_REMOTE  git remote to tag on (default: origin)
  RELEASE_BRANCH  branch to release from (default: main)
  GH_REPO         GitHub repo as owner/name (default: read from the remote's URL)
EOF
}

die() {
  printf 'release: %s\n' "$*" >&2
  exit 1
}

step() {
  printf '\n==> %s\n' "$*"
}

require() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is required but isn't installed"
  done
}

confirm() {
  local answer=""
  read -r -p "$1 [y/N] " answer || true
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

confirm_typed() {
  local expected="$1" typed=""
  read -r -p "Type $expected to confirm: " typed || true
  [[ "$typed" == "$expected" ]] || die "not confirmed, nothing was deleted"
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  else
    shasum -a 256 "$@"
  fi
}

# X.Y.Z with an optional prerelease suffix, without the leading v. An ERE, so
# both [[ =~ ]] and grep -E accept it.
VERSION_PATTERN='(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?'

parse_version() {
  local raw="${1:-}" version
  local pattern="^${VERSION_PATTERN}\$"
  version="${raw#v}"
  [[ "$version" =~ $pattern ]] || die "'$raw' isn't a version like 0.2.0 or 0.2.0-rc.1"
  VERSION="$version"
  TAG="v$version"
  PRERELEASE=false
  if [[ "$version" == *-* ]]; then
    PRERELEASE=true
  fi
}

# Filters stdin down to complete vX.Y.Z tag names. Ignoring grep's exit status
# covers "no matches" without hiding a failure earlier in the pipeline.
version_tags() {
  grep -E "^v${VERSION_PATTERN}\$" || true
}

github_repo() {
  local url
  url="$(git remote get-url "$REMOTE")" || die "no git remote named $REMOTE"
  url="${url%.git}"
  url="${url#git@github.com:}"
  url="${url#ssh://git@github.com/}"
  url="${url#https://github.com/}"
  [[ "$url" == */* && "$url" != *:* ]] || die "can't read a GitHub repo from $REMOTE's URL; set GH_REPO=owner/name"
  printf '%s\n' "$url"
}

use_github() {
  require gh
  if [[ -z "${GH_REPO:-}" ]]; then
    GH_REPO="$(github_repo)"
  fi
  export GH_REPO
  gh auth status >/dev/null 2>&1 || die "gh isn't logged in; run 'gh auth login'"
}

tag_exists_locally() {
  git rev-parse -q --verify "refs/tags/$1" >/dev/null
}

tag_exists_remotely() {
  git ls-remote --exit-code --tags "$REMOTE" "refs/tags/$1" >/dev/null 2>&1
}

release_exists() {
  gh release view "$1" >/dev/null 2>&1
}

base_target() {
  local target="${1%-baseline}"
  printf '%s\n' "${target%-modern}"
}

# @napi-rs/keyring picks its native binding at runtime from a platform package.
# Bun embeds the one for each target, but only if that package is installed;
# otherwise it compiles a stub that throws at startup.
keyring_platform() {
  local target
  target="$(base_target "$1")"
  case "$target" in
    darwin-arm64 | darwin-x64 | linux-x64-musl | linux-arm64-musl) printf '%s\n' "$target" ;;
    linux-x64 | linux-arm64) printf '%s-gnu\n' "$target" ;;
    windows-x64 | windows-arm64) printf 'win32-%s-msvc\n' "${target#windows-}" ;;
    *) return 1 ;;
  esac
}

target_label() {
  local label
  case "$(base_target "$1")" in
    darwin-arm64) label="macOS, Apple silicon" ;;
    darwin-x64) label="macOS, Intel" ;;
    linux-x64) label="Linux x64 (glibc)" ;;
    linux-arm64) label="Linux arm64 (glibc)" ;;
    linux-x64-musl) label="Linux x64 (musl, e.g. Alpine)" ;;
    linux-arm64-musl) label="Linux arm64 (musl, e.g. Alpine)" ;;
    windows-x64) label="Windows x64" ;;
    windows-arm64) label="Windows arm64" ;;
  esac
  if [[ "$1" == *-baseline ]]; then
    label="$label, CPUs without AVX2"
  fi
  printf '%s\n' "$label"
}

host_target() {
  local os arch
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) return 0 ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64) arch=x64 ;;
    *) return 0 ;;
  esac
  printf '%s-%s\n' "$os" "$arch"
}

archive_name() {
  if [[ "$1" == windows-* ]]; then
    printf 'raven-%s-%s.zip\n' "$VERSION" "$1"
  else
    printf 'raven-%s-%s.tar.gz\n' "$VERSION" "$1"
  fi
}

binary_path() {
  if [[ "$1" == windows-* ]]; then
    printf '%s/bin/%s/raven.exe\n' "$WORK_DIR" "$1"
  else
    printf '%s/bin/%s/raven\n' "$WORK_DIR" "$1"
  fi
}

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/raven-release.XXXXXX")"

cleanup() {
  if [[ -f "$WORK_DIR/package.json" ]]; then
    cp "$WORK_DIR/package.json" "$CLI_DIR/package.json"
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

stamp_cli_version() {
  cp "$CLI_DIR/package.json" "$WORK_DIR/package.json"
  node -e '
    const fs = require("node:fs");
    const [file, version] = process.argv.slice(1);
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.version = version;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$CLI_DIR/package.json" "$VERSION"
}

restore_cli_package_json() {
  cp "$WORK_DIR/package.json" "$CLI_DIR/package.json"
  rm "$WORK_DIR/package.json"
}

require_build_tools() {
  local node_major
  require git node npm pnpm tar bun
  case " $TARGETS " in
    *" windows-"*) require zip ;;
  esac
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$node_major" -ge "$MIN_NODE_MAJOR" ]] || die "Node $MIN_NODE_MAJOR or newer is required (found $(node -v))"
}

check_repository() {
  [[ "$(git branch --show-current)" == "$BRANCH" ]] || die "check out $BRANCH first"
  [[ -z "$(git status --porcelain)" ]] || die "the working tree has uncommitted changes"
  git fetch --quiet "$REMOTE" "$BRANCH"
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse "$REMOTE/$BRANCH")" ]] \
    || die "HEAD isn't the same commit as $REMOTE/$BRANCH; pull or push first"
  ! tag_exists_locally "$TAG" || die "tag $TAG already exists locally"
  ! tag_exists_remotely "$TAG" || die "tag $TAG already exists on $REMOTE"
}

install_dependencies() {
  local os="current" cpu="current" libc="current" target
  for target in $TARGETS; do
    case "$target" in
      darwin-*) os="$os,darwin" ;;
      linux-*) os="$os,linux" ;;
      windows-*) os="$os,win32" ;;
    esac
    case "$target" in
      *-arm64*) cpu="$cpu,arm64" ;;
      *-x64*) cpu="$cpu,x64" ;;
    esac
    case "$target" in
      linux-*-musl*) libc="$libc,musl" ;;
      linux-*) libc="$libc,glibc" ;;
    esac
  done
  pnpm install --frozen-lockfile --os "$os" --cpu "$cpu" --libc "$libc"
}

check_cli() {
  pnpm -C "$CLI_DIR" run typecheck
  pnpm -C "$CLI_DIR" run test
}

compile_binary() {
  local target="$1" out_dir="$WORK_DIR/bin/$target"
  mkdir -p "$out_dir"
  # Bun leaves a .<hash>-00000000.bun-build file in its working directory, so run it
  # from the output directory rather than cli/, where it would dirty the checkout.
  (cd "$out_dir" && bun build "$ROOT/$CLI_DIR/$CLI_ENTRY" --compile --target="bun-$target" --minify --sourcemap \
    --no-compile-autoload-dotenv --no-compile-autoload-bunfig --outfile "$out_dir/raven")
}

check_tarball() {
  local tarballs
  tarballs=("$OUT_DIR"/*.tgz)
  [[ ${#tarballs[@]} -eq 1 && -f "${tarballs[0]}" ]] || die "expected exactly one tarball in $OUT_DIR"
  TARBALL="${tarballs[0]}"
  tar -tzf "$TARBALL" | grep -qx 'package/dist/index.mjs' || die "$TARBALL has no dist/index.mjs"
  if tar -xzOf "$TARBALL" package/package.json | grep -qE '"(workspace|catalog):'; then
    die "$TARBALL still has workspace: or catalog: versions in its package.json"
  fi
}

package_binary() {
  local target="$1" platform binary dir
  platform="$(keyring_platform "$target")"
  binary="$(binary_path "$target")"
  dir="$(dirname "$binary")"
  [[ -f "$binary" ]] || die "bun didn't produce $binary"
  grep -a -q -E "keyring\.$platform-[a-z0-9]+\.node" "$binary" \
    || die "the $target executable doesn't embed @napi-rs/keyring-$platform, so it would fail at startup"
  if [[ "$target" == windows-* ]]; then
    (cd "$dir" && zip -q "$ROOT/$OUT_DIR/$(archive_name "$target")" raven.exe)
  else
    COPYFILE_DISABLE=1 tar -czf "$OUT_DIR/$(archive_name "$target")" -C "$dir" raven
  fi
}

build_artifacts() {
  local status_before target bun_version
  rm -rf "$OUT_DIR"
  mkdir -p "$OUT_DIR"
  status_before="$(git status --porcelain)"
  bun_version="$(bun --version)"

  stamp_cli_version
  step "Building and packing the npm package as $VERSION"
  pnpm -C "$CLI_DIR" run build
  pnpm -C "$CLI_DIR" pack --pack-destination "$ROOT/$OUT_DIR"
  for target in $TARGETS; do
    step "Compiling the $target executable with Bun $bun_version"
    compile_binary "$target"
  done
  restore_cli_package_json

  [[ "$(git status --porcelain)" == "$status_before" ]] || die "building changed tracked files:
$(git status --short)"

  step "Checking and packaging the artifacts"
  check_tarball
  for target in $TARGETS; do
    package_binary "$target"
  done
  (cd "$OUT_DIR" && sha256 raven-* >SHA256SUMS)
}

expect_version() {
  local reported
  reported="$(RAVEN_CONFIG_DIR="$WORK_DIR/config" "$1" --version)"
  [[ "$reported" == "$VERSION" ]] || die "$2 reports version '$reported', expected '$VERSION'"
  RAVEN_CONFIG_DIR="$WORK_DIR/config" "$1" --help >/dev/null
  printf '%s: raven --version reports %s\n' "$2" "$reported"
}

smoke_test() {
  local prefix="$WORK_DIR/prefix" host target ran_binary=false
  step "Smoke-testing"
  (cd "$WORK_DIR" && npm install --global --prefix "$prefix" --no-audit --no-fund "$ROOT/$TARBALL" >/dev/null)
  expect_version "$prefix/bin/raven" "npm package"

  host="$(host_target)"
  for target in $TARGETS; do
    if [[ "$(base_target "$target")" == "$host" ]]; then
      expect_version "$(binary_path "$target")" "$target executable"
      ran_binary=true
    fi
  done
  if ! $ran_binary; then
    printf 'No executable for this machine (%s) was built, so none was run.\n' "${host:-unknown}"
  fi
}

write_release_notes() {
  local target musl=false macos=false
  printf '## Install\n\n### Standalone executable\n\n'
  printf 'Needs nothing else installed. Download the file for your platform, extract it and put `raven` on your `PATH`.\n\n'
  printf '| Platform | File |\n| --- | --- |\n'
  for target in $TARGETS; do
    printf '| %s | `%s` |\n' "$(target_label "$target")" "$(archive_name "$target")"
    case "$target" in
      *-musl*) musl=true ;;
      darwin-*) macos=true ;;
    esac
  done
  printf '\n```sh\n'
  if [[ "$VISIBILITY" == "PUBLIC" ]]; then
    printf 'curl -fsSLO https://github.com/%s/releases/download/%s/<file>\n' "$GH_REPO" "$TAG"
  else
    printf 'gh release download %s --repo %s --pattern <file>\n' "$TAG" "$GH_REPO"
  fi
  printf 'tar -xf <file>\n```\n'
  if $macos; then
    printf '\nmacOS blocks executables downloaded with a browser until they are notarized, which these are not yet. Download with the command above, or run `xattr -d com.apple.quarantine raven`.\n'
  fi
  if ! $musl; then
    printf '\nThe Linux executables need glibc, so they do not run on Alpine or other musl-based systems. Use the npm package there.\n'
  fi

  printf '\n### npm package\n\nNeeds Node.js %s or newer.\n\n```sh\n' "$MIN_NODE_MAJOR"
  if [[ "$VISIBILITY" == "PUBLIC" ]]; then
    printf 'npm install --global https://github.com/%s/releases/download/%s/%s\n' "$GH_REPO" "$TAG" "$(basename "$TARBALL")"
  else
    printf 'gh release download %s --repo %s --pattern %s\n' "$TAG" "$GH_REPO" "'$(basename "$TARBALL")'"
    printf 'npm install --global ./%s\n' "$(basename "$TARBALL")"
  fi
  printf '```\n'
  if [[ -z "$PREVIOUS_TAG" ]]; then
    printf '\nFirst release.\n'
  fi
}

list_artifacts() {
  step "Artifacts in $OUT_DIR"
  ls -lh "$OUT_DIR"
}

cmd_create() {
  local dry_run=false version="" arg notes url
  for arg in "$@"; do
    case "$arg" in
      --dry-run) dry_run=true ;;
      -*) die "unknown option $arg" ;;
      *)
        [[ -z "$version" ]] || die "give one version"
        version="$arg"
        ;;
    esac
  done
  [[ -n "$version" ]] || die "usage: scripts/release.sh create <version> [--dry-run]"
  parse_version "$version"
  TARGETS="$DEFAULT_TARGETS"
  require_build_tools
  use_github

  step "Checking the repository and GitHub"
  check_repository
  ! release_exists "$TAG" || die "a GitHub release for $TAG already exists"
  PREVIOUS_TAG="$(git -c versionsort.suffix=- tag --merged HEAD --sort=-v:refname 'v[0-9]*' | version_tags | sed -n 1p)"
  VISIBILITY="$(gh repo view "$GH_REPO" --json visibility -q .visibility 2>/dev/null || echo PRIVATE)"

  step "Installing dependencies, with native modules for every target"
  install_dependencies
  step "Type-checking and testing the CLI"
  check_cli
  build_artifacts
  smoke_test
  list_artifacts

  if $dry_run; then
    step "Dry run finished"
    printf 'Every check passed. Nothing was tagged or published.\n'
    return
  fi

  printf '\nAbout to tag %s (%s) as %s, push the tag to %s,\nand create a draft release in %s with the files above.\n' \
    "$BRANCH" "$(git log -1 --format='%h %s')" "$TAG" "$REMOTE" "$GH_REPO"
  if ! confirm "Continue?"; then
    printf 'Stopped. Nothing was tagged; the files are in %s.\n' "$OUT_DIR"
    return
  fi

  step "Tagging $TAG"
  git tag -a "$TAG" -m "$TAG"
  git push "$REMOTE" "refs/tags/$TAG" || die "pushing $TAG failed; remove the local tag with: git tag -d $TAG"

  step "Creating the draft release"
  notes="$WORK_DIR/notes.md"
  write_release_notes >"$notes"
  local flags=(--draft --verify-tag --title "$TAG" --notes-file "$notes")
  if [[ -n "$PREVIOUS_TAG" ]]; then
    flags+=(--generate-notes)
  fi
  if $PRERELEASE; then
    flags+=(--prerelease)
  fi
  gh release create "$TAG" "$OUT_DIR"/raven-* "$OUT_DIR/SHA256SUMS" "${flags[@]}" >/dev/null
  url="$(gh release view "$TAG" --json url -q .url)"

  step "Draft ready"
  printf '%s\n\nCheck the notes and try an install, then run:\n  scripts/release.sh publish %s\nTo back out instead:\n  scripts/release.sh undo %s\n' \
    "$url" "$VERSION" "$VERSION"
}

cmd_build() {
  local version="" targets="" arg expecting_target=false target
  for arg in "$@"; do
    if $expecting_target; then
      targets="$targets $arg"
      expecting_target=false
      continue
    fi
    case "$arg" in
      --target) expecting_target=true ;;
      --target=*) targets="$targets ${arg#--target=}" ;;
      -*) die "unknown option $arg" ;;
      *)
        [[ -z "$version" ]] || die "give one version"
        version="$arg"
        ;;
    esac
  done
  ! $expecting_target || die "--target needs a value"
  TARGETS="${targets:-$DEFAULT_TARGETS}"
  for target in $TARGETS; do
    keyring_platform "$target" >/dev/null || die "unsupported target '$target'"
  done
  if [[ -z "$version" ]]; then
    require node
    version="$(node -p 'require("./cli/package.json").version')"
  fi
  parse_version "$version"
  require_build_tools

  step "Installing dependencies, with native modules for: $(printf '%s' "$TARGETS" | xargs)"
  install_dependencies
  build_artifacts
  smoke_test
  list_artifacts
  printf '\nBuilt from the working tree as it is. No repository or GitHub checks ran, and the\nCLI was not type-checked or tested; `create <version> --dry-run` does all of that.\n'
}

cmd_publish() {
  [[ $# -eq 1 ]] || die "usage: scripts/release.sh publish <version>"
  parse_version "$1"
  use_github

  local is_draft
  is_draft="$(gh release view "$TAG" --json isDraft -q .isDraft 2>/dev/null)" || die "there's no GitHub release for $TAG"
  [[ "$is_draft" == "true" ]] || die "$TAG is already published"

  if $PRERELEASE; then
    gh release edit "$TAG" --draft=false --prerelease >/dev/null
  else
    gh release edit "$TAG" --draft=false --latest >/dev/null
  fi
  printf 'Published %s\n' "$(gh release view "$TAG" --json url -q .url)"
  if ! $PRERELEASE; then
    printf '\nHomebrew: the bump workflow in Astera-org/homebrew-raven opens a pull request for\n%s within a day, or run scripts/update-formula.sh %s there now.\n' "$TAG" "$VERSION"
  fi
}

cmd_undo() {
  [[ $# -eq 1 ]] || die "usage: scripts/release.sh undo <version>"
  parse_version "$1"
  require git
  use_github

  local was_published=false
  printf 'This deletes the GitHub release %s in %s (if any) and the tag %s on %s and locally.\n' \
    "$TAG" "$GH_REPO" "$TAG" "$REMOTE"
  confirm_typed "$TAG"

  if release_exists "$TAG"; then
    if [[ "$(gh release view "$TAG" --json isDraft -q .isDraft)" == "false" ]]; then
      was_published=true
    fi
    gh release delete "$TAG" --cleanup-tag --yes
  fi
  if tag_exists_remotely "$TAG"; then
    git push "$REMOTE" --delete "refs/tags/$TAG"
  fi
  if tag_exists_locally "$TAG"; then
    git tag -d "$TAG"
  fi
  rm -rf "$OUT_DIR"

  printf 'Removed %s.\n' "$TAG"
  if $was_published; then
    printf 'It had been published. If release immutability is on for this repo, GitHub will not\nallow %s again, so release the next version instead.\n' "$TAG"
  fi
}

cmd_purge() {
  [[ $# -eq 0 ]] || die "usage: scripts/release.sh purge"
  require git
  use_github

  local releases remote_tags local_tags tag
  releases="$(gh release list --limit 1000 --json tagName -q '.[].tagName' | version_tags)"
  remote_tags="$(git ls-remote --tags --refs "$REMOTE" | awk '{print $2}' | sed 's#^refs/tags/##' | version_tags)"
  local_tags="$(git tag -l 'v[0-9]*' | version_tags)"

  if [[ -z "$releases$remote_tags$local_tags" ]]; then
    printf 'No vX.Y.Z releases or tags to delete.\n'
    return
  fi
  printf 'GitHub releases in %s:\n%s\n\nTags on %s:\n%s\n\nLocal tags:\n%s\n\n' \
    "$GH_REPO" "${releases:-  (none)}" "$REMOTE" "${remote_tags:-  (none)}" "${local_tags:-  (none)}"
  confirm_typed "$GH_REPO"

  for tag in $releases; do
    gh release delete "$tag" --cleanup-tag --yes
  done
  for tag in $remote_tags; do
    if tag_exists_remotely "$tag"; then
      git push "$REMOTE" --delete "refs/tags/$tag"
    fi
  done
  for tag in $local_tags; do
    git tag -d "$tag"
  done
  rm -rf "$OUT_DIR"
  printf 'Done. Published tag names may stay reserved if release immutability is on.\n'
}

main() {
  local command="${1:-}"
  if [[ $# -gt 0 ]]; then
    shift
  fi
  case "$command" in
    create) cmd_create "$@" ;;
    build) cmd_build "$@" ;;
    publish) cmd_publish "$@" ;;
    undo) cmd_undo "$@" ;;
    purge) cmd_purge "$@" ;;
    "" | -h | --help | help) usage ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
