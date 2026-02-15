import { defineConfig, type DefineConfigItem } from "bunup";

export default defineConfig([
  {
    name: "dist",
    entry: "src/index.ts",
    outDir: "dist",

    format: ["esm"],
    target: "browser",

    dts: true,
    minify: true,
    sourcemap: false,
    splitting: false,

    clean: true
  },
  {
    name: "demo",
    entry: "src/example.ts",
    outDir: "demo",

    format: ["esm"],
    target: "browser",
    splitting: false,
    sourcemap: true,

    clean: false
  }
]) as DefineConfigItem[];
