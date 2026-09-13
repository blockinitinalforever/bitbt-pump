import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import JavaScriptObfuscator from "javascript-obfuscator";

const root = process.cwd();
const sourceRoot = path.join(root, "public", "launchpad");
const outputRoot = path.join(root, ".next", "protected-public", "launchpad");
const seed = 20260913;

const firstPartyOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.85,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.12,
  identifierNamesGenerator: "hexadecimal",
  identifiersPrefix: "btp",
  numbersToExpressions: true,
  renameGlobals: false,
  renameProperties: false,
  seed,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayEncoding: ["base64"],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.9,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

// WalletConnect is a large third-party bundle. It still receives control-flow
// flattening, but at a lower threshold to preserve mobile startup performance.
const vendorOptions = {
  ...firstPartyOptions,
  controlFlowFlatteningThreshold: 0.12,
  deadCodeInjection: false,
  identifiersPrefix: "btw",
  numbersToExpressions: false,
  selfDefending: false,
  splitStrings: false,
  stringArrayCallsTransform: false,
  stringArrayEncoding: [],
  stringArrayThreshold: 0.2,
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const listJavaScript = async (directory, prefix = "") => {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJavaScript(path.join(directory, entry.name), relative)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(relative);
    }
  }
  return files.sort();
};

const productionHtml = ["bitbt-launch-ui-app.html", "bitbt-wallet-ui.html"];
for (const file of productionHtml) {
  const html = await fs.readFile(path.join(sourceRoot, file), "utf8");
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (inlineScripts.some((match) => match[1].trim().length > 0)) {
    throw new Error(`${file} contains inline JavaScript; move it to an external file so protection cannot be bypassed`);
  }
}

const targets = (await listJavaScript(sourceRoot)).filter(
  (file) => !file.split(path.sep).join("/").startsWith("assets/vendor/"),
);
if (targets.length === 0) throw new Error("no Launchpad JavaScript found to protect");

const sourceVersions = new Map();
for (const file of targets) {
  sourceVersions.set(file, sha256(await fs.readFile(path.join(sourceRoot, file))));
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

const manifest = {
  schema: 1,
  strategy: "javascript-obfuscator-control-flow",
  seed,
  sourceMaps: false,
  files: [],
};

for (const file of targets) {
  const options = file === "walletconnect-provider.js" ? vendorOptions : firstPartyOptions;
  const originalSource = await fs.readFile(path.join(sourceRoot, file), "utf8");
  const source = file === "launchpad-live.js"
    ? originalSource.replace(
        "./walletconnect-provider.js",
        `./walletconnect-provider.js?v=${sourceVersions.get("walletconnect-provider.js").slice(0, 16)}`,
      )
    : originalSource;
  const result = JavaScriptObfuscator.obfuscate(source, { ...options, sourceMap: false });
  const output = result.getObfuscatedCode();

  if (!output || output === source || output.includes("sourceMappingURL=")) {
    throw new Error(`client protection validation failed for ${file}`);
  }
  if (file === "launchpad-live.js" && output.includes("Live data adapter for the delivered Launchpad UI")) {
    throw new Error("first-party source marker survived obfuscation");
  }

  const outputFile = path.join(outputRoot, file);
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, output, "utf8");
  manifest.files.push({
    file,
    sourceBytes: Buffer.byteLength(source),
    outputBytes: Buffer.byteLength(output),
    sourceSha256: sha256(originalSource),
    outputSha256: sha256(output),
    controlFlowFlatteningThreshold: options.controlFlowFlatteningThreshold,
  });
}

const versionForAsset = async (asset) => {
  const normalized = asset.replace(/^\.\//, "").split("?", 1)[0];
  const protectedFile = manifest.files.find((entry) => entry.file === normalized);
  if (protectedFile) return protectedFile.outputSha256.slice(0, 16);

  const sourceFile = path.join(sourceRoot, normalized);
  return sha256(await fs.readFile(sourceFile)).slice(0, 16);
};

const versionScriptReferences = async (html) => {
  const matches = [...html.matchAll(/<script\b[^>]*\bsrc=(['"])(\.\/[^'"?#]+\.js)(?:\?[^'"]*)?\1[^>]*><\/script>/gi)];
  let versioned = html;
  for (const match of matches) {
    const asset = match[2];
    const version = await versionForAsset(asset);
    versioned = versioned.replace(match[0], match[0].replace(asset, `${asset}?v=${version}`));
  }
  return versioned;
};

const launchAppName = "bitbt-launch-ui-app.html";
const launchAppSource = await fs.readFile(path.join(sourceRoot, launchAppName), "utf8");
const launchAppOutput = await versionScriptReferences(launchAppSource);
const launchAppVersion = sha256(launchAppOutput).slice(0, 16);
await fs.writeFile(path.join(outputRoot, launchAppName), launchAppOutput, "utf8");

const walletName = "bitbt-wallet-ui.html";
const walletSource = await fs.readFile(path.join(sourceRoot, walletName), "utf8");
const walletOutput = walletSource.replace(
  /\/launchpad\/bitbt-launch-ui-app\.html(?:\?[^'"]*)?/g,
  `/launchpad/bitbt-launch-ui-app.html?v=${launchAppVersion}`,
);
await fs.writeFile(path.join(outputRoot, walletName), walletOutput, "utf8");

manifest.html = productionHtml.map((file) => ({
  file,
  outputSha256: sha256(file === launchAppName ? launchAppOutput : walletOutput),
}));

await fs.writeFile(
  path.join(root, ".next", "client-protection-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

for (const file of manifest.files) {
  console.log(
    `protected ${file.file}: ${file.sourceBytes} -> ${file.outputBytes} bytes, sha256=${file.outputSha256}`,
  );
}
