import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    example: "src/example.ts",
  },
  tsconfig: "tsconfig.json",

  format: ["esm"],
  target: "es2018",
  platform: "browser",

  dts: true,
  minify: true,
  sourcemap: true,
  clean: true,
  bundle: true,
  splitting: false,

  treeshake: true,
  publicDir: './public'
});
