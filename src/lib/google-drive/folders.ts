/**
 * Google OAuth scopes cannot be limited to one folder, so we enforce containment ourselves:
 * every read / link / upload / delete must pass assertInsideRoot().
 */
import { DriveError } from "./errors";

export type ParentsFetcher = (fileId: string) => Promise<string[] | null>;

const MAX_DEPTH = 32;

export interface RootGuard {
  isInsideRoot(fileId: string): Promise<boolean>;
  assertInsideRoot(fileId: string): Promise<void>;
  clear(): void;
}

/**
 * Factory (injectable fetcher => unit-testable). Walks `parents` upwards until the root is found.
 * Results are cached per folder id: `folder -> inside root?`.
 */
export function createRootGuard(
  rootId: () => string,
  fetchParents: ParentsFetcher,
  opts: { ttlMs?: number; now?: () => number } = {},
): RootGuard {
  const ttl = opts.ttlMs ?? 5 * 60_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { inside: boolean; exp: number }>();

  async function check(id: string, depth: number, seen: Set<string>): Promise<boolean> {
    const root = rootId();
    if (id === root) return true;
    if (depth > MAX_DEPTH || seen.has(id)) return false;
    seen.add(id);
    const hit = cache.get(id);
    if (hit && hit.exp > now()) return hit.inside;

    const parents = await fetchParents(id);
    let inside = false;
    if (parents) {
      for (const p of parents) {
        if (await check(p, depth + 1, seen)) {
          inside = true;
          break;
        }
      }
    }
    cache.set(id, { inside, exp: now() + ttl });
    return inside;
  }

  const isInsideRoot = (fileId: string) => (fileId ? check(fileId, 0, new Set()) : Promise.resolve(false));
  return {
    isInsideRoot,
    async assertInsideRoot(fileId) {
      if (!(await isInsideRoot(fileId))) throw new DriveError("outside_root", "File nằm ngoài thư mục gốc được phép.", 403);
    },
    clear: () => cache.clear(),
  };
}
