# Sharp WebAssembly Corresponding Source and Relink Procedure

## Distribution identity

SEMForge production dependency images can contain `@img/sharp-wasm32@0.35.3`. Its
`sharp-wasm32-0.35.3.node.wasm` is a statically linked Combined Work containing
libvips and other libraries. The native shared-libvips replacement procedure does
not apply to this artifact.

The release gate binds the distributed bytes to all of the following:

- npm integrity `sha512-cZ0XkcYGpHZkqW6iCkqTcmUC0CD9DhD5d/qeZlZkfRBn6GnHniZXLUo5+9xw8Iv76YE6LQFN9YNBlKREcCG76w==`
- package tarball SHA-256 `fcab5cbbbf24ce63840c273e2da0214147f68e478bfa899b1a06db6d65eb86e0`
- installed WASM SHA-256 `1a53f5983c8bd3f90b90b58a4800673e434cbe02779fdb1fa1a952328b8c3ab2`
- Sharp commit `1018449164723ba0203c1beffaba0e21f7829c18` (`v0.35.3`)
- Sharp-libvips commit `4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6` (`v1.3.2`)
- wasm-vips build commit `9ff73c569c91ded6f8d8c7570967d0dadcf0134d`
- `@img/sharp-libvips-dev-wasm32@1.3.2` integrity
  `sha512-WYWUA7413vd+Tl0LDQ7/8z5FJYgQTVbNMp47jS4TfeT5G9/iWdRLvpjRRdJ3GJGqpjxqX0Tm/pH6Ey0d4o6mcQ==`
- Emscripten 6.0.1 image manifest
  `sha256:d0be652409a4d3362b8a36c3279dd1123ff1c9327e603d86d9361aa84f1d2e4c`

## What the distribution includes

`/app/legal/sources/sharp-wasm` in every runtime image contains:

- the exact Sharp, Sharp-libvips, and wasm-vips application/build source;
- pinned source archives for all 29 libraries listed by the distributed
  Sharp-libvips package, including each archive's copyright/license file paths;
- the four patches applied by the wasm build path;
- the exact `@img/sharp-libvips-dev-wasm32@1.3.2` relink input and original
  `@img/sharp-wasm32@0.35.3` distribution package;
- canonical upstream license/third-party notice files;
- `source-manifest.json` and `bundle-index.json` with SHA-256 digests; and
- this document plus `relink-sharp-wasm.sh`.

The source bundle verifier fails if a URL no longer yields the pinned bytes, a
declared copyright/license path is absent, an artifact is missing, or any digest
changes. Treat the bundle as part of the product distribution and retain it for
at least as long as the corresponding image can be distributed.

`npm run license:check` is the deterministic CI gate: it validates the generated
notices and exact manifest contract without depending on upstream availability.
`npm run license:sources:verify-upstream` is the network materialization audit.
The Docker production-dependency stage performs the same pinned downloads and
then checks the completed local bundle, so a production image cannot be built
without the source and relink evidence actually present in the artifact.

## Rebuild and relink

The bundled script rebuilds the Sharp application against the bundled static
development package. It validates every source-bundle file, verifies there are
exactly 28 `.a` archives in the actual npm relink package, runs the upstream
Sharp Emscripten build, and emits a replacement `@img/sharp-wasm32@0.35.3`
tarball:

```sh
/app/legal/sources/sharp-wasm/relink/relink-sharp-wasm.sh \
  /app/legal/sources/sharp-wasm \
  /absolute/path/to/an-empty-work-directory
```

To relink modified LGPL libraries, first rebuild the desired archive(s) from the
matching source archive in `archives/` using Emscripten 6.0.1 and the build
flags/patches in the bundled `wasm-vips` and `sharp-libvips` sources. Replace the
corresponding `.a` file under the extracted
`@img/sharp-libvips-dev-wasm32@1.3.2/lib`, then run the same script. Do not change
the archive's public ABI or Sharp's build cannot link it.

The script's output can replace the installed optional package in a production
dependency tree:

```sh
npm install --no-save /absolute/path/to/img-sharp-wasm32-0.35.3.tgz
node -e "require('@img/sharp-wasm32/sharp.node')"
```

Rebuild the SEMForge image from that dependency tree and exercise PDF rendering.
Record the replacement package SHA-256, image digest, render result, and modified
library source commit in the release evidence.

SEMForge imposes no additional contractual restriction on reverse engineering
for debugging modifications to LGPL-covered portions of this Combined Work.
