import { PdfService } from './pdf.service';

describe('PdfService logo handling', () => {
    let service: PdfService;

    beforeEach(() => {
        service = new PdfService();
    });

    it('prepares an SVG logo using the native pdfmake representation', async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" /></svg>';
        spyOn(window, 'fetch').and.resolveTo(new Response(
            new Blob([svg], { type: 'image/svg+xml' }),
            { status: 200 }
        ));

        const asset = await (service as any).getLogoAsset('https://example.com/gym-logo.svg');

        expect(asset).toEqual({ kind: 'svg', markup: svg });
    });

    it('generates a PDF blob with an SVG gym logo', async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="#000000" /></svg>';
        spyOn(window, 'fetch').and.resolveTo(new Response(
            new Blob([svg], { type: 'image/svg+xml' }),
            { status: 200 }
        ));

        const definition = await (service as any).createDocumentDefinition(
            {
                id: 'routine-id',
                clientId: 'client-id',
                name: 'Rutina de prueba',
                objective: 'Fuerza',
                trainingDaysCount: 0,
                durationWeeks: 1,
                days: []
            },
            { id: 'client-id', name: 'Cliente' },
            {
                id: 'coach-id',
                email: 'coach@example.com',
                name: 'Gimnasio',
                role: 'coach',
                createdAt: new Date(),
                logoUrl: 'https://example.com/gym-logo.svg',
                brandColor: '#000000'
            }
        );
        const blob = await (service as any).createPdfBlob(definition);

        expect(blob.type).toBe('application/pdf');
        expect(blob.size).toBeGreaterThan(0);
    });

    it('keeps PNG logos as data URLs', async () => {
        spyOn(window, 'fetch').and.resolveTo(new Response(
            new Blob(['png-content'], { type: 'image/png' }),
            { status: 200 }
        ));

        const asset = await (service as any).getLogoAsset('https://example.com/gym-logo.png');

        expect(asset?.kind).toBe('raster');
        expect(asset?.dataUrl).toContain('data:image/png;base64,');
    });

    it('does not restore the default logo when the fallback explicitly disables branding', async () => {
        const fetchSpy = spyOn(window, 'fetch');

        const header = await (service as any).createHeader(
            {
                id: 'coach-id',
                email: 'coach@example.com',
                name: 'Gimnasio',
                role: 'coach',
                createdAt: new Date(),
                logoUrl: ''
            },
            { name: 'Rutina', objective: 'Fuerza' },
            { name: 'Cliente' }
        );

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(header.stack[1].table.body[0][0]).toEqual({ text: '' });
    });
});
