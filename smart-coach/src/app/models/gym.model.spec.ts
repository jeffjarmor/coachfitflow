import { isSupportedGymLogoFile } from './gym.model';

describe('isSupportedGymLogoFile', () => {
    it('accepts JPG, JPEG and PNG files with matching MIME types', () => {
        expect(isSupportedGymLogoFile({ name: 'logo.jpg', type: 'image/jpeg' })).toBeTrue();
        expect(isSupportedGymLogoFile({ name: 'logo.JPEG', type: 'image/jpeg' })).toBeTrue();
        expect(isSupportedGymLogoFile({ name: 'logo.png', type: 'image/png' })).toBeTrue();
    });

    it('rejects SVG, WebP and mismatched extensions', () => {
        expect(isSupportedGymLogoFile({ name: 'logo.svg', type: 'image/svg+xml' })).toBeFalse();
        expect(isSupportedGymLogoFile({ name: 'logo.webp', type: 'image/webp' })).toBeFalse();
        expect(isSupportedGymLogoFile({ name: 'logo.svg', type: 'image/png' })).toBeFalse();
    });
});
