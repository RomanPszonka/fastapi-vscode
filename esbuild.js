import { copyFileSync, globSync, mkdirSync } from "node:fs"
import path from "node:path"
import esbuild from "esbuild"

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")
const noBundleForCoverage = process.argv.includes("--no-bundle")

function copyWasmFiles() {
  const wasmDestDir = path.join(import.meta.dirname, "dist", "wasm")
  mkdirSync(wasmDestDir, { recursive: true })

  // web-tree-sitter.wasm from node_modules
  const coreSrc = path.join(
    import.meta.dirname,
    "node_modules",
    "web-tree-sitter",
    "web-tree-sitter.wasm",
  )
  copyFileSync(coreSrc, path.join(wasmDestDir, "web-tree-sitter.wasm"))
  console.log("Copied web-tree-sitter.wasm -> dist/wasm/")

  // tree-sitter-python.wasm from wasm/ directory (checked into repo)
  const pythonSrc = path.join(
    import.meta.dirname,
    "wasm",
    "tree-sitter-python.wasm",
  )
  copyFileSync(pythonSrc, path.join(wasmDestDir, "tree-sitter-python.wasm"))
  console.log("Copied tree-sitter-python.wasm -> dist/wasm/")
}

async function main() {
  copyWasmFiles()

  const testEntryPoints = !production ? globSync("src/test/**/*.test.ts") : []
  const sourceEntryPoints = noBundleForCoverage
    ? globSync("src/**/*.ts")
    : ["src/extension.ts"]

  // Shared esbuild options
  const sharedOptions = {
    bundle: !noBundleForCoverage,
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    treeShaking: true,
    logLevel: "info",
    define: {
      "process.env.NODE_ENV": production ? '"production"' : '"development"',
      __DIST_ROOT__: JSON.stringify(path.join(import.meta.dirname, "dist")),
    },
  }

  // Node build (desktop VS Code)
  const nodeCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: [...sourceEntryPoints, ...testEntryPoints],
    format: "cjs",
    platform: "node",
    target: "node20",
    outdir: "dist",
    outbase: "src",
    ...(noBundleForCoverage ? {} : { external: ["vscode", "web-tree-sitter"] }),
  })

  // Browser build (vscode.dev) - skip for unbundled builds
  const browserCtx = noBundleForCoverage
    ? null
    : await esbuild.context({
        ...sharedOptions,
        entryPoints: ["src/extension.ts"],
        format: "cjs",
        platform: "browser",
        target: "es2022",
        outfile: "dist/web/extension.js",
        // Polyfill/alias node modules for browser
        alias: {
          "node:path": "path-browserify",
        },
        // vscode is provided by the runtime; web-tree-sitter is bundled but
        // internally references these Node.js modules for environment detection
        external: ["vscode", "fs/promises", "module"],
      })

  const allContexts = [nodeCtx, browserCtx].filter(Boolean)

  if (watch) {
    await Promise.all(allContexts.map((ctx) => ctx.watch()))
    console.log("Watching for changes...")
  } else {
    await Promise.all(allContexts.map((ctx) => ctx.rebuild()))
    await Promise.all(allContexts.map((ctx) => ctx.dispose()))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
