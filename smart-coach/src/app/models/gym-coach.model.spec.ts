import { GymCoach } from './gym-coach.model';
import { hasGymOwnerAccess, isPrimaryGymOwner } from './gym-coach.model';

describe('gym ownership helpers', () => {
    const gym = { ownerId: 'primary-owner' };

    function member(coachId: string, role: GymCoach['role']): GymCoach {
        return {
            coachId,
            role,
            name: 'Coach',
            email: 'coach@example.com',
            joinedAt: new Date()
        };
    }

    it('grants owner access to the primary owner and co-owners', () => {
        expect(hasGymOwnerAccess(gym, member('primary-owner', 'owner'), 'primary-owner')).toBeTrue();
        expect(hasGymOwnerAccess(gym, member('co-owner', 'owner'), 'co-owner')).toBeTrue();
    });

    it('does not grant owner access to trainers or receptionists', () => {
        expect(hasGymOwnerAccess(gym, member('trainer', 'trainer'), 'trainer')).toBeFalse();
        expect(hasGymOwnerAccess(gym, member('reception', 'receptionist'), 'reception')).toBeFalse();
    });

    it('keeps the primary-owner distinction', () => {
        expect(isPrimaryGymOwner(gym, 'primary-owner')).toBeTrue();
        expect(isPrimaryGymOwner(gym, 'co-owner')).toBeFalse();
    });
});
