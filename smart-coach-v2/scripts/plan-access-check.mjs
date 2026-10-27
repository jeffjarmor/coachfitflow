import assert from 'node:assert/strict';
import { hasActiveIndependentPro, isPaidPlanCurrent, localCalendarDate } from '../src/app/core/data/plan-access.ts';

process.env.TZ = 'America/Costa_Rica';
const evening = new Date('2026-09-25T01:00:00Z'); // 24 Sep, 19:00 in Costa Rica

assert.equal(localCalendarDate(evening), '2026-09-24');
assert.equal(isPaidPlanCurrent('2026-09-24', evening), true);
assert.equal(isPaidPlanCurrent('2026-09-23', evening), false);
assert.equal(isPaidPlanCurrent('2026-09-25', evening), true);
assert.equal(isPaidPlanCurrent('2026-02-30', evening), false);
assert.equal(isPaidPlanCurrent(null, evening), false);

assert.equal(hasActiveIndependentPro({ accountType: 'independent', coachPlan: 'paid', nextPlanPaymentDate: localCalendarDate() }), true);
assert.equal(hasActiveIndependentPro({ accountType: 'gym', coachPlan: 'paid', nextPlanPaymentDate: localCalendarDate() }), false);

console.log('Plan Pro: fecha local, vencimiento e identidad independiente verificados.');
