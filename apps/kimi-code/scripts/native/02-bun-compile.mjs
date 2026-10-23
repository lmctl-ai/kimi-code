import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  collectNativeAssets,
  nativeAssetManifestKey,
  nativeAssetSummary,
} from './assets.mjs';
import { fail, run, tryRun } from './exec.mjs';
import {
  appRoot,
  nativeBinDir,
  nativeBinPath,
  nativeIntermediatesDir,
  nativeJsBundlePath,
  nativeManifestDir,
  targetTriple,
} from './paths.mjs';
import { collectWebAssets, webAssetManifestKey } from './web-assets.mjs';

export function bunCompileTarget(target = targetTriple()) {
  return `bun-${target.replace(/^win32-/, 'windows-')}`;
}

export function nativeBunEntryPath() {
  return resolve(nativeIntermediatesDir(), 'bun-entry.mjs');
}

async function ensureBundleExists() {
  try {
    await stat(nativeJsBundlePath());
  } catch {
    fail(`Native JS bundle not found at ${nativeJsBundlePath()}. Run 01-bundle.mjs first.`);
  }
}

async function writeBunEntry(target) {
  await mkdir(nativeIntermediatesDir(), { recursive: true });
  const { manifest, manifestJson, assets } = await collectNativeAssets({
    appRoot,
    target,
  });
  const web = await collectWebAssets({ appRoot, target });
  const manifestPath = resolve(nativeManifestDir(target), 'manifest.json');
  const webManifestPath = resolve(nativeIntermediatesDir(), 'web-assets', target, 'manifest.json');
  await mkdir(dirname(manifestPath), { recursive: true });
  await mkdir(dirname(webManifestPath), { recursive: true });
  await writeFile(manifestPath, manifestJson);
  await writeFile(webManifestPath, web.manifestJson);

  const embeddedAssets = {
    [nativeAssetManifestKey(target)]: manifestPath,
    [webAssetManifestKey(target)]: webManifestPath,
    ...assets,
    ...web.assets,
  };
  const sortedEntries = Object.entries(embeddedAssets).sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    ...sortedEntries.map(
      ([, filePath], index) =>
        `import asset_${index} from ${JSON.stringify(filePath)} with { type: "file" };`,
    ),
    'globalThis.__KIMI_BUN_ASSETS__ = Object.freeze({',
    ...sortedEntries.map(([assetKey], index) => `  ${JSON.stringify(assetKey)}: asset_${index},`),
    '});',
    'await import("./main.cjs");',
  ];
  const entryPath = nativeBunEntryPath();
  await writeFile(entryPath, `${lines.join('\n')}\n`);

  console.log(`Collected native assets for ${manifest.target}:`);
  for (const line of nativeAssetSummary(manifest)) {
    console.log(`- ${line}`);
  }
  console.log(
    `Collected web assets for ${web.manifest.target}: ${web.manifest.files.length} files`,
  );
  return entryPath;
}

export async function runBunCompileStep() {
  await ensureBundleExists();
  const target = targetTriple();
  const entryPath = await writeBunEntry(target);
  await mkdir(nativeBinDir(target), { recursive: true });
  const out = nativeBinPath(target);
  const bunCmd = process.env.BUN_BIN ?? 'bun';
  await run(bunCmd, [
    'build',
    '--compile',
    `--target=${bunCompileTarget(target)}`,
    entryPath,
    '--outfile',
    out,
  ]);
  if (process.platform !== 'win32') {
    await run('chmod', ['755', out]);
  }
  if (process.platform === 'darwin') {
    await tryRun('codesign', ['--remove-signature', out]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runBunCompileStep();
}
