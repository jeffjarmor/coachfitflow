import { RoutinePdfRenderer } from './routine-pdf-renderer';
import { portalRoutineForPdf, routinePlanForPdf } from './routine-pdf.adapters';
import { RoutineWithDays } from './routine-pdf.models';
import { emptyRoutinePlan } from './routine.models';
import { ClientPortalRoutineDetail } from '../client-portal/client-portal-data.service';

// Covers the data that previously disappeared or changed between the two routine exporters.
describe('V1 routine PDF compatibility', () => {
  const client = { name: 'María / López', age: 32, weight: 64, height: 165 };
  const coach = { name: 'Entrenadora', email: 'coach@example.invalid', brandColor: '#7030a0', logoUrl: '' };
  const routine: RoutineWithDays = {
    name: 'Fuerza: progresión', objective: 'Mejorar fuerza', trainingDaysCount: 3,
    startDate: new Date(2026, 9, 17, 12), endDate: new Date(2026, 10, 14, 12), notes: 'Progresar sin dolor.',
    warmup: { enabled: true, customText: 'Movilidad antes de iniciar.', cardioExercises: [{ exerciseId: 'bike', exerciseName: 'Bicicleta' }] },
    days: [{ dayNumber: 1, dayName: 'Day 1', muscleGroups: ['Piernas'], notes: 'Hidratarse.', exercises: [
      { exerciseName: 'Sentadilla', sets: 3, reps: '10', rest: '60 s', notes: 'Controlar el descenso.',
        blockType: 'biserie', blockLabel: 'A', blockPosition: 1,
        weekConfigs: [{ startWeek: 1, endWeek: 2, sets: 4, reps: '8', rest: '90 s', notes: 'Subir carga gradualmente.' }] },
      { exerciseName: 'Remo', sets: 3, reps: '12', rest: '60 s', videoUrl: 'www.youtube.com/watch?v=demo', blockType: 'single' }
    ] }]
  };

  it('retains metrics, notes, warmup, grouped exercises, weekly notes and clickable exercise links', async () => {
    const renderer = new RoutinePdfRenderer() as any;
    const doc = await renderer.createDocumentDefinition(routine, client, coach);
    const content = JSON.stringify(doc.content);
    for (const text of ['32 años', '64 kg', '165 cm', '3 días/semana', '17/10/2026', '14/11/2026',
      'Notas Generales', 'Progresar sin dolor.', 'Cardio: Bicicleta', 'Movilidad antes de iniciar.', 'Día 1',
      'Biserie A1', 'Sem 1-2: 4', 'Sem 1-2: Subir carga gradualmente.', 'Notas: Hidratarse.']) {
      expect(content).withContext(text).toContain(text);
    }
    expect(content).toContain('https://www.youtube.com/results?search_query=Sentadilla%20ejercicio');
    expect(content).toContain('https://www.youtube.com/watch?v=demo');
    expect(content).not.toContain('pageBreak');
    expect(doc.pageMargins).toEqual([40, 60, 40, 60]);
    expect(JSON.stringify(doc.footer(2, 3))).toContain('Página 2 de 3');
  });

  it('uses black for an unset color and retains a selected color throughout the PDF branding', async () => {
    const renderer = new RoutinePdfRenderer() as any;
    for (const brandColor of [undefined, null, '', '#7030a0']) {
      const doc = await renderer.createDocumentDefinition(routine, client, { ...coach, brandColor });
      const color = brandColor || '#000000';
      expect(doc.content[0].stack[0].canvas[0].color).toBe(color);
      expect(doc.content[0].stack[1].table.body[0][2].stack[0].color).toBe(color);
      expect(doc.styles.dayHeader.color).toBe(color);
    }
  });

  it('retries a failed branded PDF without the logo and downloads only once with a safe file name', async () => {
    const renderer = new RoutinePdfRenderer() as any;
    const definition = spyOn(renderer, 'createDocumentDefinition').and.resolveTo({ content: [] });
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    const create = spyOn(renderer, 'createPdfBlob').and.returnValues(Promise.reject(new Error('bad logo')), Promise.resolve(blob));
    const download = spyOn(renderer, 'downloadFile');
    await renderer.generateRoutinePDF(routine, client, { ...coach, logoUrl: '/logo.svg' });
    expect(create).toHaveBeenCalledTimes(2);
    expect((definition.calls.argsFor(1)[2] as { logoUrl: string }).logoUrl).toBe('');
    expect(download).toHaveBeenCalledOnceWith(blob, 'Maria_-_Lopez_Fuerza-_progresion.pdf');
  });

  it('exports when a logo is unavailable, unsupported, oversized or invalid SVG', async () => {
    const renderer = new RoutinePdfRenderer() as any;
    const fetchLogo = spyOn(window, 'fetch');
    const responses = [
      new Response('', { status: 404 }), new Response('image', { headers: { 'Content-Type': 'image/webp' } }),
      new Response(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' })),
      new Response('<not-svg/>', { headers: { 'Content-Type': 'image/svg+xml' } })
    ];
    for (const response of responses) {
      fetchLogo.and.resolveTo(response);
      const doc = await renderer.createDocumentDefinition(routine, client, { ...coach, logoUrl: '/logo' });
      expect(JSON.stringify(doc.content)).toContain('Fuerza: progresión');
      expect(JSON.stringify(doc.content)).not.toContain('"image":');
      expect(JSON.stringify(doc.content)).not.toContain('"svg":');
    }
  });

  it('maps coach and Portal routines to the same document and preserves calendar dates', () => {
    const plan = emptyRoutinePlan('client', 'Atleta');
    Object.assign(plan, { name: 'Fuerza', objective: 'Fuerza', startDate: '2026-10-17', endDate: '2026-11-14' });
    plan.days[0].exercises = [{
      exerciseId: 'custom', exerciseName: 'Sentadilla', muscleGroup: 'Piernas', source: 'coach',
      imageUrl: '/exercise.webp', sets: 3, reps: '10', rest: '60 s', notes: '', order: 1,
      blockType: 'single', blockId: null, blockLabel: null, blockPosition: null, blockRest: null, weekConfigs: []
    }];
    const portal: ClientPortalRoutineDetail = {
      id: 'routine', name: plan.name, objective: plan.objective, trainingDaysCount: plan.trainingDaysCount,
      durationWeeks: plan.durationWeeks!, startDate: plan.startDate, endDate: plan.endDate, notes: plan.notes,
      warmupEnabled: plan.warmup.enabled, warmupCustomText: plan.warmup.customText,
      days: plan.days.map(day => ({ id: 'day', number: day.dayNumber, name: day.dayName,
        muscleGroups: day.muscleGroups, notes: day.notes, exercises: day.exercises.map(exercise => ({
          ...exercise, id: 'assignment', name: exercise.exerciseName, videoUrl: exercise.videoUrl || null
        })) }))
    };
    for (const converted of [routinePlanForPdf(plan), portalRoutineForPdf(portal)]) {
      expect(converted.startDate?.getDate()).toBe(17);
      expect(converted.endDate?.getDate()).toBe(14);
      expect(converted.days.map(day => [day.dayNumber, day.dayName])).toEqual(plan.days.map(day => [day.dayNumber, day.dayName]));
      expect(converted.days[0].exercises[0].imageUrl).toBe('/exercise.webp');
    }
  });

  it('downloads a PDF with small, reusable PNG thumbnails converted from exercise WebP images', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 300;
    canvas.getContext('2d')!.fillRect(0, 0, 600, 300);
    const webp = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/webp'));
    const fetchImage = spyOn(window, 'fetch').and.callFake(async () => new Response(webp));
    const withImages = structuredClone(routine);
    const exerciseId = '2b4cddba-ccdc-44cc-91ab-4e2bd779deca';
    Object.assign(withImages.days[0].exercises[0], { imageUrl: `/assets/exercises/v1/${exerciseId}.webp` });
    Object.assign(withImages.days[0].exercises[1], { exerciseId, source: 'global', imageUrl: null });
    const renderer = new RoutinePdfRenderer() as any;
    const create = spyOn(renderer, 'createPdfBlob').and.resolveTo(new Blob(['pdf'], { type: 'application/pdf' }));
    const download = spyOn(renderer, 'downloadFile');

    await renderer.generateRoutinePDF(withImages, client, coach);

    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledOnceWith(jasmine.any(Blob), 'Maria_-_Lopez_Fuerza-_progresion.pdf');
    const doc = create.calls.first().args[0] as any;
    const images = findExerciseImages(doc.content);
    expect(images.length).toBe(2);
    if (!images.length) return;
    expect(images[0].fit).toEqual([48, 48]);
    expect(images[1].image).toBe(images[0].image);
    const png = doc.images[images[0].image];
    expect(png).toMatch(/^data:image\/png;base64,/);
    const decoded = new Image();
    await new Promise<void>((resolve, reject) => {
      decoded.onload = () => resolve();
      decoded.onerror = reject;
      decoded.src = png;
    });
    expect([decoded.naturalWidth, decoded.naturalHeight]).toEqual([144, 72]);
    expect(JSON.stringify(doc.content)).toContain('Sem 1-2: Subir carga gradualmente.');
    expect(JSON.stringify(doc.content)).toContain('https://www.youtube.com/watch?v=demo');
  });

  it('keeps downloading exercise text when images are missing, invalid, oversized or unavailable', async () => {
    const renderer = new RoutinePdfRenderer() as any;
    const create = spyOn(renderer, 'createPdfBlob').and.resolveTo(new Blob(['pdf'], { type: 'application/pdf' }));
    const download = spyOn(renderer, 'downloadFile');
    const fetchImage = spyOn(window, 'fetch');
    const responses = [
      new Response('', { status: 404 }),
      new Response('invalid image', { headers: { 'Content-Type': 'image/webp' } }),
      new Response(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' }))
    ];
    const withImages = structuredClone(routine);
    Object.assign(withImages.days[0].exercises[0], { imageUrl: '/unavailable.webp' });
    for (const response of responses) {
      fetchImage.and.resolveTo(response);
      await renderer.generateRoutinePDF(withImages, client, coach);
      const doc = create.calls.mostRecent().args[0] as any;
      expect(JSON.stringify(doc.content)).toContain('Sentadilla');
      expect(JSON.stringify(doc.content)).toContain('Remo');
      expect(findExerciseImages(doc.content)).toEqual([]);
    }
    expect(fetchImage).toHaveBeenCalledTimes(responses.length);
    expect(download).toHaveBeenCalledTimes(responses.length);
  });

  function findExerciseImages(value: any): any[] {
    if (!value || typeof value !== 'object') return [];
    return [...(value.image ? [value] : []), ...Object.values(value).flatMap(findExerciseImages)];
  }
});
