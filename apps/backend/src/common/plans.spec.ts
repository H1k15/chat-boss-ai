import {
  PLANS,
  PLAN_KEYS,
  planFor,
  DEFAULT_PLAN,
  MAX_SESSIONS_PER_USER,
} from './plans';

describe('plans — gói dịch vụ', () => {
  it('planFor: gói lạ/thiếu -> default', () => {
    expect(planFor(undefined).key).toBe('default');
    expect(planFor(null).key).toBe('default');
    expect(planFor('khong-ton-tai').key).toBe('default');
    expect(planFor('pro').key).toBe('pro');
  });

  it('gói default có hạn mức, unlimited = null', () => {
    expect(DEFAULT_PLAN).toBe('default');
    expect(PLANS.default.maxAiPerDay).toBeGreaterThan(0);
    expect(PLANS.default.maxUsers).toBeGreaterThan(0);
    expect(PLANS.default.maxSeats).toBeGreaterThan(0);
    expect(PLANS.unlimited.maxAiPerDay).toBeNull();
    expect(PLANS.unlimited.maxUsers).toBeNull();
    expect(PLANS.unlimited.maxSeats).toBeNull();
  });

  it('PLAN_KEYS gồm default/pro/unlimited', () => {
    expect(PLAN_KEYS).toEqual(
      expect.arrayContaining(['default', 'pro', 'unlimited']),
    );
  });

  it('maxUsers <= maxSeats <= maxUsers * MAX_SESSIONS_PER_USER (mỗi tài khoản ~1 máy, tối đa 2 bề mặt)', () => {
    for (const p of Object.values(PLANS)) {
      if (p.maxSeats != null && p.maxUsers != null) {
        // Mỗi tài khoản cần ít nhất 1 phiên -> maxSeats >= maxUsers.
        expect(p.maxSeats).toBeGreaterThanOrEqual(p.maxUsers);
        // Mỗi tài khoản tối đa MAX_SESSIONS_PER_USER phiên -> trần trên.
        expect(p.maxSeats).toBeLessThanOrEqual(
          p.maxUsers * MAX_SESSIONS_PER_USER,
        );
      }
    }
  });
});
