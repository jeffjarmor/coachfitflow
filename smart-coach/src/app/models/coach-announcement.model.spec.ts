import { Coach } from './coach.model';
import { CoachAnnouncement, isAnnouncementVisibleForCoach } from './coach-announcement.model';

describe('isAnnouncementVisibleForCoach', () => {
    const paidAnnouncement: CoachAnnouncement = {
        id: 'announcement-id',
        title: 'Novedad Pro',
        message: 'Nueva función',
        audience: 'paid',
        active: true,
        sortOrder: 1
    };

    const gymCoach: Coach = {
        id: 'gym-coach',
        email: 'gym@example.com',
        name: 'Gym Coach',
        role: 'coach',
        accountType: 'gym',
        coachPlan: 'standard',
        createdAt: new Date()
    };

    it('shows Pro announcements to gym coaches', () => {
        expect(isAnnouncementVisibleForCoach(paidAnnouncement, gymCoach)).toBeTrue();
    });

    it('does not classify gym coaches as standard-plan recipients', () => {
        expect(isAnnouncementVisibleForCoach({
            ...paidAnnouncement,
            audience: 'standard'
        }, gymCoach)).toBeFalse();
    });
});
