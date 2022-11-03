const esbuild = require("esbuild");
const process = require("process");
const path = require("path");
const fs = require("fs/promises");

const sharedOptions = {
  bundle: true,
  sourcemap: true,

  // for importing files directly into pages
  loader: { ".png": "file" },
  assetNames: "public/[name]-[hash]",
};

const nodeSharedOptions = {
  ...sharedOptions,
  platform: "node",
  mainFields: ["module", "main"], // to allow bundling json-schema-to-openapi-schema
  define: {
    "process.env.CURRENT_VERSION": `${JSON.stringify(
      process.env.npm_package_version
    )}`,
  },
};

const browserSharedOptions = {
  ...sharedOptions,
  jsxFactory: "h",
  platform: "browser",
  define: {
    "process.env.NODE_ENV": "'development'",
    "process.env.EXPECT_TEST": "false",
  },
};

const buildCasServerOptions = {
  ...nodeSharedOptions,
  entryPoints: ["src/server.tsx"],
  outdir: "out",
};

const buildCasClientOptions = {
  ...browserSharedOptions,
  entryPoints: ["src/client.tsx"],
  outdir: "out/client",
};

esbuild.build(buildCasServerOptions).catch(() => process.exit(1));
esbuild.build(buildCasClientOptions).catch(() => process.exit(1));
