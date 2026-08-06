/**
 * Free-tier quota.
 *
 * Canva's premium app guidelines require that the free experience stays
 * genuinely useful and that free features are never taken away later, so keep
 * this limit generous. It exists to bound abuse, not to push people to upgrade.
 *
 * This is an in-memory counter: it resets when the process restarts and is not
 * shared between instances. Move it to Redis (or any shared store) before you
 * run more than one backend instance, otherwise the limit is per-instance.
 */

const FREE_GENERATIONS_PER_DAY = Number(
  process.env.FREE_GENERATIONS_PER_DAY ?? 25,
);

const DAY_MS = 24 * 60 * 60 * 1000;

type Usage = {
  count: number;
  resetsAt: number;
};

const usageByUser = new Map<string, Usage>();

function currentUsage(userId: string, now: number): Usage {
  const existing = usageByUser.get(userId);

  if (!existing || now >= existing.resetsAt) {
    const fresh: Usage = { count: 0, resetsAt: now + DAY_MS };
    usageByUser.set(userId, fresh);
    return fresh;
  }

  return existing;
}

/** Opportunistic cleanup so the map doesn't grow without bound. */
function prune(now: number): void {
  for (const [userId, usage] of usageByUser) {
    if (now >= usage.resetsAt) {
      usageByUser.delete(userId);
    }
  }
}

export type FreeTierDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0 };

export function consumeFreeGeneration(userId: string): FreeTierDecision {
  const now = Date.now();

  if (usageByUser.size > 10_000) {
    prune(now);
  }

  const usage = currentUsage(userId, now);

  if (usage.count >= FREE_GENERATIONS_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }

  usage.count += 1;

  return {
    allowed: true,
    remaining: Math.max(0, FREE_GENERATIONS_PER_DAY - usage.count),
  };
}

/** Exposed for tests. */
export function resetFreeTierUsage(): void {
  usageByUser.clear();
}
