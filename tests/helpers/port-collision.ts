import { expect } from 'vitest';

/**
 * Port-collision guidance conformance checks (SW-196).
 *
 * Shared guardrails every generated Node template README must satisfy: no
 * instruction may tell users to kill arbitrary processes, no automatic port
 * hopping, and no house-specific port names that do not exist in the template.
 */
export function assertNoArbitraryProcessKilling(readme: string): void {
  const forbidden = [
    'kill -9',
    'taskkill /f',
    'taskkill /im',
    'pkill ',
    'kill --force',
    'kill $(',
    'killall',
    'killim',
  ];

  for (const pattern of forbidden) {
    expect(readme.toLowerCase()).not.toContain(pattern);
  }
}

/** Asserts the template does not advertise automatic port hopping. */
export function assertNoAutomaticPortHopping(readme: string): void {
  const forbidden = ['port hopping', 'random free port', 'pick a random port'];

  for (const pattern of forbidden) {
    expect(readme.toLowerCase()).not.toContain(pattern);
  }
}
