import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { appRoot } from './paths.mjs';

const packageName = '@moonshot-ai/kimi-code';
const packageJson = JSON.parse(
  await readFile(resolve(appRoot, 'package.json'), 'utf-8'),
);

export function nextReleaseVersion(base, existingTags = []) {
  const parseSemver = (v) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const compareSemver = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const baseParts = parseSemver(base);
  if (!baseParts) {
    throw new Error(`Invalid base version: ${base}`);
  }
  const highest = existingTags
    .map(parseSemver)
    .filter((v) => v !== null)
    .sort(compareSemver)
    .at(-1);
  if (!highest || compareSemver(baseParts, highest) > 0) {
    return `${baseParts[0]}.${baseParts[1]}.${baseParts[2]}`;
  }
  return `${highest[0]}.${highest[1]}.${highest[2] + 1}`;
}

function parsePublishedPackages() {
  const raw = process.env['CHANGESETS_PUBLISHED_PACKAGES'];
  if (raw === undefined || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function outputLine(name, value) {
  return `${name}=${value}\n`;
}

export function resolveReleaseInfo(env = process.env, defaultVersion = packageJson.version) {
  const publishedPackages = parsePublishedPackages();
  if (publishedPackages !== null) {
    const publishedPackage = publishedPackages.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        entry.name === packageName &&
        typeof entry.version === 'string',
    );
    const version = publishedPackage?.version ?? defaultVersion;
    const shouldPublish = publishedPackage !== undefined;
    return {
      shouldPublish,
      version,
      tag: `v${version}`,
    };
  }

  const refName = env['GITHUB_REF_NAME'] ?? '';
  const ref = env['GITHUB_REF'] ?? '';
  const inputVersion = (env['KIMI_RELEASE_VERSION'] ?? '').trim();

  if (ref.startsWith('refs/tags/v') && /^v\d+\.\d+\.\d+/.test(refName)) {
    const version = refName.replace(/^v/, '');
    return { shouldPublish: true, version, tag: refName };
  }

  if (inputVersion.length > 0) {
    const version = inputVersion.replace(/^v/, '');
    return { shouldPublish: true, version, tag: `v${version}` };
  }

  const existingTags = (env['KIMI_EXISTING_RELEASE_TAGS'] ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const version = nextReleaseVersion(defaultVersion, existingTags);
  return { shouldPublish: true, version, tag: `v${version}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { shouldPublish, version, tag } = resolveReleaseInfo();
  const githubOutput = process.env['GITHUB_OUTPUT'];

  if (githubOutput !== undefined) {
    await appendFile(
      githubOutput,
      [
        outputLine('should_publish', String(shouldPublish)),
        outputLine('version', version),
        outputLine('tag', tag),
      ].join(''),
    );
  }

  console.log(`should_publish=${String(shouldPublish)}`);
  console.log(`version=${version}`);
  console.log(`tag=${tag}`);
}
