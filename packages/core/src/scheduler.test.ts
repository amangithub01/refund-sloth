import { describe, expect, it } from 'vitest';
import { buildPlist, buildWinCmd } from './scheduler.ts';

describe('nightly scheduler files', () => {
  it('builds a launchd plist at the configured time', () => {
    const p = buildPlist('30 3 * * *');
    expect(p).toContain('<key>Hour</key><integer>3</integer>');
    expect(p).toContain('<key>Minute</key><integer>30</integer>');
  });
  it('builds a Windows .cmd wrapper that runs `sloth run` and logs', () => {
    const c = buildWinCmd();
    expect(c.startsWith('@echo off\r\n')).toBe(true);
    expect(c).toMatch(/--import ".+" ".+index\.ts" run >> ".+nightly\.log" 2>&1/);
    expect(c).toContain('set "SLOTH_DATA_DIR=');
  });
});
