#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 SOURCE_BUNDLE EMPTY_WORK_DIRECTORY" >&2
  exit 64
fi

BUNDLE_PATH="$(cd "$1" && pwd -P)"
WORK_PATH="$2"
if [ ! -f "$BUNDLE_PATH/bundle-index.json" ] || [ ! -f "$BUNDLE_PATH/source-manifest.json" ]; then
  echo "source bundle index/manifest is missing" >&2
  exit 65
fi
if [ -e "$WORK_PATH" ] && [ "$(find "$WORK_PATH" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "work directory must be empty: $WORK_PATH" >&2
  exit 65
fi
mkdir -p "$WORK_PATH"
WORK_PATH="$(cd "$WORK_PATH" && pwd -P)"

node "$BUNDLE_PATH/relink/build-sharp-source-bundle.mjs" \
  --manifest "$BUNDLE_PATH/source-manifest.json" \
  --output "$BUNDLE_PATH" \
  --check

mkdir -p "$WORK_PATH/sharp" "$WORK_PATH/dev-package" "$WORK_PATH/output"
tar -xzf "$BUNDLE_PATH/archives/sharp-1018449164723ba0203c1beffaba0e21f7829c18.tar.gz" \
  --strip-components=1 -C "$WORK_PATH/sharp"
tar -xzf "$BUNDLE_PATH/relink-inputs/sharp-libvips-dev-wasm32-1.3.2.tgz" \
  --strip-components=1 -C "$WORK_PATH/dev-package"

STATIC_COUNT="$(find "$WORK_PATH/dev-package/lib" -maxdepth 1 -type f -name '*.a' | wc -l | tr -d ' ')"
if [ "$STATIC_COUNT" != "28" ]; then
  echo "expected 28 static relink libraries, found $STATIC_COUNT" >&2
  exit 65
fi

EMSCRIPTEN_IMAGE="emscripten/emsdk@sha256:d0be652409a4d3362b8a36c3279dd1123ff1c9327e603d86d9361aa84f1d2e4c"
docker run --rm \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --network=bridge \
  --volume "$WORK_PATH:/work" \
  --workdir /work/sharp \
  "$EMSCRIPTEN_IMAGE" \
  bash -euo pipefail -c '
    test "$(emcc -dumpversion)" = "6.0.1"
    npm ci
    npm run build:dist
    test "$(node -p "require(\"@img/sharp-libvips-dev-wasm32/versions\").emscripten")" = "6.0.1"
    cp -a /work/dev-package/. node_modules/@img/sharp-libvips-dev-wasm32/
    emmake npm run build
    emmake npm run package-from-local-build
    npm pack ./npm/wasm32 --pack-destination /work/output
  '

REBUILT_TARBALL="$(find "$WORK_PATH/output" -maxdepth 1 -type f -name 'img-sharp-wasm32-0.35.3.tgz' -print -quit)"
if [ -z "$REBUILT_TARBALL" ]; then
  echo "rebuilt @img/sharp-wasm32@0.35.3 tarball is missing" >&2
  exit 65
fi
echo "rebuilt package: $REBUILT_TARBALL"
echo "install into an unpacked SEMForge production dependency tree with:"
echo "npm install --no-save '$REBUILT_TARBALL'"
