import { PLANS, PLAN_KEYS, planFor } from './plans';

describe('plans — gói dịch vụ', () => {
  it('planFor: gói lạ/thiếu -> free', () => {
    expect(planFor(undefined).key).toBe('free');
    expect(planFor(null).key).toBe('free');
    expect(planFor('khong-ton-tai').key).toBe('free');
    expect(planFor('pro').key).toBe('pro');
  });

  it('free có hạn mức, unlimited = null', () => {
    expect(PLANS.free.maxAiPerDay).toBeGreaterThan(0);
    expect(PLANS.free.maxUsers).toBeGreaterThan(0);
    expect(PLANS.unlimited.maxAiPerDay).toBeNull();
    expect(PLANS.unlimited.maxUsers).toBeNull();
  });

  it('PLAN_KEYS gồm free/pro/unlimited', () => {
    expect(PLAN_KEYS).toEqual(
      expect.arrayContaining(['free', 'pro', 'unlimited']),
    );
  });
});
