import { Coach, hasCoachPremiumFeatureAccess } from './coach.model';

describe('hasCoachPremiumFeatureAccess', () => {
    const referenceDate = new Date('2026-08-21T12:00:00Z');

    function coach(overrides: Partial<Coach>): Coach {
        return {
            id: 'coach-id',
            email: 'coach@example.com',
            name: 'Coach',
            role: 'coach',
            accountType: 'independent',
            coachPlan: 'standard',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            ...overrides
        };
    }

    it('enables premium features for a gym coach without an individual paid plan', () => {
        expect(hasCoachPremiumFeatureAccess(coach({ accountType: 'gym' }), referenceDate)).toBeTrue();
    });

    it('enables premium features for an active paid independent coach', () => {
        expect(hasCoachPremiumFeatureAccess(coach({
            coachPlan: 'paid',
            nextPlanPaymentDate: '2026-08-22'
        }), referenceDate)).toBeTrue();
    });

    it('keeps premium features locked for standard or expired independent coaches', () => {
        expect(hasCoachPremiumFeatureAccess(coach({}), referenceDate)).toBeFalse();
        expect(hasCoachPremiumFeatureAccess(coach({
            coachPlan: 'paid',
            nextPlanPaymentDate: '2026-08-20'
        }), referenceDate)).toBeFalse();
    });
});
