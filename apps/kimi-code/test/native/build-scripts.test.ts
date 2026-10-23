import { describe, expect, it } from 'vitest';

import { bunCompileTarget } from '../../scripts/native/02-bun-compile.mjs';
import { nextReleaseVersion, resolveReleaseInfo } from '../../scripts/native/resolve-release.mjs';
import { SEA_EXEC_ARGV, seaCodeCacheEnabled } from '../../scripts/native/sea-options.mjs';

describe('sea-options', () => {
  it('bakes a bounded young generation into the binary', () => {
    expect(SEA_EXEC_ARGV).toEqual(['--max-semi-space-size=16']);
    expect(Object.isFrozen(SEA_EXEC_ARGV)).toBe(true);
  });

  it('only enables the V8 code cache when the target matches the build host', () => {
    expect(seaCodeCacheEnabled('darwin-arm64', 'darwin-arm64')).toBe(true);
    expect(seaCodeCacheEnabled('linux-x64', 'darwin-arm64')).toBe(false);
  });
});

describe('bun-compile', () => {
  it('maps platform targets to bun compile targets', () => {
    expect(bunCompileTarget('linux-x64')).toBe('bun-linux-x64');
    expect(bunCompileTarget('linux-arm64')).toBe('bun-linux-arm64');
    expect(bunCompileTarget('darwin-x64')).toBe('bun-darwin-x64');
    expect(bunCompileTarget('darwin-arm64')).toBe('bun-darwin-arm64');
    expect(bunCompileTarget('win32-x64')).toBe('bun-windows-x64');
    expect(bunCompileTarget('win32-arm64')).toBe('bun-windows-arm64');
  });
});

describe('resolve-release', () => {
  it('uses base version when no release tags exist or base is newer', () => {
    expect(nextReleaseVersion('2.1.1', [])).toBe('2.1.1');
    expect(nextReleaseVersion('2.1.1', ['v2.0.0', 'v2.1.0'])).toBe('2.1.1');
  });

  it('increments patch version when existing release tag matches or exceeds base', () => {
    expect(nextReleaseVersion('2.1.1', ['v2.1.1'])).toBe('2.1.2');
    expect(nextReleaseVersion('2.1.1', ['v2.1.1', 'v2.1.4'])).toBe('2.1.5');
  });

  it('resolves v* tag pushes directly', () => {
    expect(
      resolveReleaseInfo(
        { GITHUB_REF: 'refs/tags/v2.3.0', GITHUB_REF_NAME: 'v2.3.0' },
        '2.1.1',
      ),
    ).toEqual({
      shouldPublish: true,
      version: '2.3.0',
      tag: 'v2.3.0',
    });
  });
});
