import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { getNativePackageRoot } from './native-assets';

type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;
type CreateRequireFn = typeof createRequire;

interface ModuleWithLoad {
  _load?: ModuleLoad;
  createRequire?: CreateRequireFn;
}

const nodeRequire = createRequire(import.meta.url);
let installed = false;

// pi-tui loads its platform-specific native helpers via an absolute-path
// require() computed from import.meta.url / process.execPath
// (see pi-tui dist/native-platform.js and dist/native-module-path.js). In a
// SEA or Bun single-file binary those .node files live in the native-asset
// cache, so redirect any absolute require of a pi-tui native helper to the
// cached copy.
//
// Path shape: native/<darwin|linux|win32>/prebuilds/<arch>/<file>.node — note
// the two path segments after "prebuilds", so ".+" (not "[^/]+") is required.
const PI_TUI_NATIVE_PATTERN = /native[\\/](?:win32|darwin|linux)[\\/]prebuilds[\\/].+\.node$/;

function resolveRedirectedRequest(request: unknown): string | null {
  if (
    typeof request !== 'string' ||
    !PI_TUI_NATIVE_PATTERN.test(request) ||
    existsSync(request)
  ) {
    return null;
  }
  const pkgRoot = getNativePackageRoot('@moonshot-ai/pi-tui');
  if (pkgRoot === null) return null;
  const match = request.match(PI_TUI_NATIVE_PATTERN);
  return match === null ? null : join(pkgRoot, match[0]);
}

export function installNativeModuleHook(): void {
  if (installed) return;
  installed = true;

  const moduleBuiltin = nodeRequire('node:module') as ModuleWithLoad;
  const originalLoad = moduleBuiltin._load;
  if (originalLoad !== undefined) {
    moduleBuiltin._load = function loadWithNativeAssets(
      this: unknown,
      request: string,
      parent: unknown,
      isMain: boolean,
    ): unknown {
      const redirected = resolveRedirectedRequest(request);
      if (redirected !== null) {
        return originalLoad.call(this, redirected, parent, isMain);
      }
      return originalLoad.call(this, request, parent, isMain);
    };
  }

  const originalCreateRequire = moduleBuiltin.createRequire;
  if (typeof originalCreateRequire === 'function') {
    const boundCreateRequire = originalCreateRequire.bind(moduleBuiltin);
    moduleBuiltin.createRequire = function createRequireWithNativeAssets(
      filename: Parameters<CreateRequireFn>[0],
    ): ReturnType<CreateRequireFn> {
      const req = boundCreateRequire(filename);
      const wrapped = function requireWithNativeAssets(id: string): unknown {
        const redirected = resolveRedirectedRequest(id);
        return req(redirected ?? id);
      } as ReturnType<CreateRequireFn>;
      Object.assign(wrapped, req);
      return wrapped;
    };
  }
}
