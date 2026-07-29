import { PLANS, PLAN_KEYS, planFor, DEFAULT_PLAN } from './plans';

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
});
