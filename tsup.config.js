import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  tsconfig: "tsconfig.json",

  format: ["esm"],
  target: "es2018",
  platform: "browser",

  dts: true,
  minify: true,
  sourcemap: true,
  clean: true,

  treeshake: true,
});
