import { Injectable, inject } from '@angular/core';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import {
    RoutineWithDays,
    DayExercise,
    Routine,
    TrainingDay,
    getRoutineExerciseBlockLabel,
    isGroupedRoutineExerciseBlockType
} from '../models/routine.model';
import { Coach, DEFAULT_COACH_BRAND_COLOR, DEFAULT_COACH_LOGO_URL } from '../models/coach.model';
import { Client } from '../models/client.model';

// Initialize pdfMake with fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs;

type PdfLogoAsset =
    | { kind: 'raster'; dataUrl: string }
    | { kind: 'svg'; markup: string };

@Injectable({
    providedIn: 'root'
})
export class PdfService {
    private readonly imageFetchTimeoutMs = 5000;
    private readonly imageReadTimeoutMs = 5000;
    private readonly pdfBlobTimeoutMs = 20000;
    private readonly maxEmbeddedImageBytes = 2 * 1024 * 1024;

    /**
     * Generate and download routine PDF
     */
    async generateRoutinePDF(
        routine: RoutineWithDays,
        client: Client,
        coach: Coach
    ): Promise<void> {
        try {
            console.log('Generating PDF for:', client.name);
            const docDefinition = await this.createDocumentDefinition(routine, client, coach);
            let blob: Blob;

            try {
                blob = await this.createPdfBlob(docDefinition);
            } catch (error) {
                console.warn('PDF generation failed with branding. Retrying without logo:', error);
                const fallbackDefinition = await this.createDocumentDefinition(routine, client, {
                    ...coach,
                    logoUrl: ''
                });
                blob = await this.createPdfBlob(fallbackDefinition);
            }

            this.downloadFile(blob, this.buildSafePdfFileName(client.name, routine.name));
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw error;
        }
    }

    private createPdfBlob(docDefinition: TDocumentDefinitions): Promise<Blob> {
        const pdfDocGenerator = pdfMake.createPdf(docDefinition);

        return new Promise((resolve, reject) => {
            let settled = false;
            const timeoutId = window.setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error('La generación del PDF tardó demasiado.'));
            }, this.pdfBlobTimeoutMs);

            try {
                pdfDocGenerator.getBlob((blob) => {
                    if (settled) return;
                    settled = true;
                    window.clearTimeout(timeoutId);
                    resolve(blob);
                });
            } catch (error) {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    /**
     * Manual file download helper for better cross-browser compatibility
     */
    private downloadFile(blob: Blob, fileName: string): void {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;

        // Append to body is required for some browsers (Firefox, some mobile)
        document.body.appendChild(link);

        link.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 100);
    }

    private buildSafePdfFileName(clientName: string, routineName: string): string {
        const fallback = 'rutina';
        const clean = `${clientName || 'cliente'}_${routineName || fallback}`
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/-+/g, '-')
            .replace(/^[-_.]+|[-_.]+$/g, '')
            .slice(0, 120);

        return `${clean || fallback}.pdf`;
    }

    /**
     * Create PDF document definition
     */
    private async createDocumentDefinition(
        routine: RoutineWithDays,
        client: Client,
        coach: Coach
    ): Promise<TDocumentDefinitions> {
        console.log('PDF Generation - Routine Data:', JSON.stringify(routine, null, 2));
        const content: Content[] = [];
        const brandColor = coach.brandColor || DEFAULT_COACH_BRAND_COLOR;

        // Header with coach logo and info
        content.push(await this.createHeader(coach, routine, client));

        // Client info section
        content.push(this.createClientInfo(client, routine));

        // General notes from routine setup (step 2)
        if ((routine.notes || '').trim()) {
            content.push(this.createGeneralNotesSection(routine.notes || '', brandColor));
        }

        // Optional warmup section
        if (routine.warmup?.enabled) {
            content.push(this.createWarmupSection(routine, brandColor));
        }

        // Training days
        for (const day of routine.days) {
            content.push(this.createDaySection(day, brandColor));
        }

        return {
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            content,
            footer: (currentPage: number, pageCount: number) => this.createFooter(coach, currentPage, pageCount),
            styles: this.getStyles(brandColor),
            defaultStyle: {
                font: 'Roboto',
                fontSize: 10
            }
        };
    }

    /**
     * Create PDF header
     */
    private async createHeader(coach: Coach, routine: Routine, client: Client): Promise<Content> {
        const brandColor = coach.brandColor || DEFAULT_COACH_BRAND_COLOR;
        let logoCell: any = { text: '' };

        // An explicit empty string is used by the error fallback to disable the logo.
        const logoUrl = coach.logoUrl === '' ? '' : (coach.logoUrl || DEFAULT_COACH_LOGO_URL);
        if (logoUrl) {
            const logoAsset = await this.getLogoAsset(logoUrl);
            if (logoAsset?.kind === 'raster') {
                logoCell = {
                    image: logoAsset.dataUrl,
                    fit: [62, 62],
                    alignment: 'left'
                };
            } else if (logoAsset?.kind === 'svg') {
                logoCell = {
                    svg: logoAsset.markup,
                    fit: [62, 62],
                    alignment: 'left'
                };
            }
        }

        const infoStack = [
            { text: coach.name, style: 'coachName', color: brandColor },
            { text: routine.name || 'Rutina', style: 'routineTitle', margin: [0, 2, 0, 4] },
            { text: `Cliente: ${client.name}`, style: 'metaText', margin: [0, 1, 0, 0] },
            { text: `Objetivo: ${routine.objective || '-'}`, style: 'metaText' }
        ];

        return {
            stack: [
                {
                    canvas: [
                        {
                            type: 'rect',
                            x: 0,
                            y: 0,
                            w: 515,
                            h: 8,
                            color: brandColor
                        }
                    ],
                    margin: [0, 0, 0, 12]
                },
                {
                    table: {
                        widths: [72, 24, '*'],
                        body: [[
                            logoCell,
                            { text: '' },
                            { stack: infoStack, margin: [0, 2, 0, 0] }
                        ]]
                    },
                    layout: {
                        hLineWidth: () => 0,
                        vLineWidth: () => 0,
                        paddingLeft: () => 0,
                        paddingRight: () => 0,
                        paddingTop: () => 0,
                        paddingBottom: () => 0
                    },
                    margin: [0, 0, 0, 8]
                }
            ],
            margin: [0, 0, 0, 14]
        };
    }

    /**
     * Create client info section
     */
    private createClientInfo(client: Client, routine: Routine): Content {
        const startDateText = this.formatDateForPdf(routine.startDate);
        const endDateText = this.formatDateForPdf(routine.endDate);
        const metrics = [
            { label: 'Edad', value: client.age ? `${client.age} años` : '-' },
            { label: 'Peso', value: client.weight ? `${client.weight} kg` : '-' },
            { label: 'Altura', value: client.height ? `${client.height} cm` : '-' },
            { label: 'Frecuencia', value: `${routine.trainingDaysCount || 0} días/semana` }
        ];

        const metricCells: any[] = metrics.map(item => ({
            stack: [
                { text: item.label, style: 'kpiLabel' },
                { text: item.value, style: 'kpiValue' }
            ],
            fillColor: '#ffffff',
            margin: [8, 8, 8, 8] as [number, number, number, number]
        }));

        return {
            stack: [
                {
                    table: {
                        widths: ['*', '*', '*', '*'],
                        body: [metricCells]
                    },
                    layout: {
                        hLineWidth: () => 0.8,
                        vLineWidth: () => 0.8,
                        hLineColor: () => '#e2e8f0',
                        vLineColor: () => '#e2e8f0',
                        paddingLeft: () => 0,
                        paddingRight: () => 0,
                        paddingTop: () => 0,
                        paddingBottom: () => 0
                    }
                },
                {
                    table: {
                        widths: ['*'],
                        body: [[{
                            text: `Periodo: ${startDateText} - ${endDateText}`,
                            style: 'metaText',
                            fillColor: '#f8fafc',
                            margin: [8, 6, 8, 6]
                        }]]
                    },
                    layout: {
                        hLineWidth: () => 0.8,
                        vLineWidth: () => 0.8,
                        hLineColor: () => '#e2e8f0',
                        vLineColor: () => '#e2e8f0'
                    },
                    margin: [0, 10, 0, 0]
                }
            ],
            margin: [0, 0, 0, 20]
        };
    }

    /**
     * Create general routine notes section
     */
    private createGeneralNotesSection(notes: string, brandColor: string): Content {
        return {
            table: {
                widths: [4, '*'],
                body: [[
                    { text: '', fillColor: brandColor, border: [false, false, false, false] },
                    {
                        stack: [
                            { text: 'Notas Generales', style: 'sectionTitle', margin: [0, 0, 0, 6] },
                            { text: notes, style: 'normal' }
                        ],
                        fillColor: '#f7f9fc',
                        margin: [10, 8, 10, 8],
                        border: [false, false, false, false]
                    }
                ]]
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0
            },
            margin: [0, 0, 0, 14]
        };
    }

    private formatDateForPdf(value: any): string {
        if (!value) return '-';

        let date: Date | null = null;

        if (value instanceof Date) {
            date = value;
        } else if (typeof value === 'string' || typeof value === 'number') {
            date = new Date(value);
        } else if (typeof value?.toDate === 'function') {
            date = value.toDate();
        } else if (typeof value?.seconds === 'number') {
            date = new Date(value.seconds * 1000);
        }

        if (!date || Number.isNaN(date.getTime())) return '-';

        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    /**
     * Create training day section
     */
    private createDaySection(day: TrainingDay, brandColor: string): Content {
        const dayContent: Content[] = [];

        // Day header - Replace "Day" with "Día" for legacy routines
        const muscleGroupsText = Array.isArray(day.muscleGroups)
            ? day.muscleGroups.join(', ')
            : (day.muscleGroups || '');

        // Replace "Day" with "Día" in case we have legacy data
        const dayNameInSpanish = day.dayName.replace(/^Day\s+/i, 'Día ');

        dayContent.push({
            stack: [
                {
                    canvas: [{ type: 'rect', x: 0, y: 0, w: 28, h: 3, color: brandColor }],
                    margin: [0, 0, 0, 4]
                },
                { text: dayNameInSpanish, style: 'dayHeader', margin: [0, 0, 0, 2] },
                { text: muscleGroupsText || '-', style: 'daySubheader' }
            ],
            margin: [0, 16, 0, 10]
        });

        // Exercises table
        const tableBody: any[] = [
            [
                { text: 'Ejercicio', style: 'tableHeader' },
                { text: 'Series', style: 'tableHeader' },
                { text: 'Reps', style: 'tableHeader' },
                { text: 'Descanso', style: 'tableHeader' },
                { text: 'Notas', style: 'tableHeader' }
            ]
        ];

        const exercises = Array.isArray(day.exercises) ? day.exercises : [];
        for (const exercise of exercises) {
            const exerciseLink = this.buildExerciseLink(exercise);
            // Determine sets/reps/rest text or stack
            let setsContent: any = { text: exercise.sets.toString(), style: 'tableCell', alignment: 'center' };
            let repsContent: any = { text: exercise.reps, style: 'tableCell', alignment: 'center' };
            let restContent: any = { text: exercise.rest, style: 'tableCell', alignment: 'center' };

            if (exercise.weekConfigs && exercise.weekConfigs.length > 0) {
                // Create a more organized layout for progressive overload
                // Don't show "Base" label, just show the week configurations
                const setsStack: any[] = [];
                const repsStack: any[] = [];
                const restStack: any[] = [];

                exercise.weekConfigs.forEach((config, index) => {
                    const weekLabel = config.startWeek === config.endWeek
                        ? `Sem ${config.startWeek}`
                        : `Sem ${config.startWeek}-${config.endWeek}`;

                    setsStack.push({
                        text: `${weekLabel}: ${config.sets}`,
                        fontSize: 8,
                        color: '#616161',
                        margin: [0, 1, 0, 1]
                    });
                    repsStack.push({
                        text: `${weekLabel}: ${config.reps}`,
                        fontSize: 8,
                        color: '#616161',
                        margin: [0, 1, 0, 1]
                    });
                    restStack.push({
                        text: `${weekLabel}: ${config.rest}`,
                        fontSize: 8,
                        color: '#616161',
                        margin: [0, 1, 0, 1]
                    });
                });

                setsContent = { stack: setsStack, alignment: 'left', margin: [5, 2, 5, 2] };
                repsContent = { stack: repsStack, alignment: 'left', margin: [5, 2, 5, 2] };
                restContent = { stack: restStack, alignment: 'left', margin: [5, 2, 5, 2] };
            }

            const row: any[] = [
                {
                    stack: [
                        {
                            text: exercise.exerciseName,
                            style: 'exerciseName',
                            ...(exerciseLink && {
                                link: exerciseLink,
                                color: '#1976d2',
                                decoration: 'underline'
                            })
                        },
                        ...(isGroupedRoutineExerciseBlockType(exercise.blockType) || exercise.isSuperset
                            ? [{ text: `(${this.getBlockDisplayLabel(exercise)})`, style: 'supersetLabel' }]
                            : [])
                    ]
                },
                setsContent,
                repsContent,
                restContent,
                this.buildExerciseNotesCell(exercise)
            ];

            tableBody.push(row);
        }

        dayContent.push({
            table: {
                widths: ['*', 64, 70, 60, 110],
                body: tableBody
            },
            layout: {
                fillColor: (rowIndex: number) => {
                    if (rowIndex === 0) return '#edf2f7';
                    return rowIndex % 2 === 0 ? '#fafbfd' : null;
                },
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => '#d8e0ea',
                vLineColor: () => '#d8e0ea',
                paddingLeft: () => 5,
                paddingRight: () => 5,
                paddingTop: () => 5,
                paddingBottom: () => 5
            }
        });

        if (day.notes) {
            dayContent.push({
                text: `Notas: ${day.notes}`,
                style: 'dayNotes',
                margin: [0, 5, 0, 0]
            });
        }

        return dayContent;
    }

    private getBiserieLabel(exercise: DayExercise): string {
        const label = exercise.blockLabel || '';
        const position = exercise.blockPosition || '';
        return `${label}${position ? position : ''}`.trim();
    }

    private getBlockDisplayLabel(exercise: DayExercise): string {
        const blockLabel = getRoutineExerciseBlockLabel(exercise.blockType);
        const positionLabel = this.getBiserieLabel(exercise);
        return `${blockLabel}${positionLabel ? ` ${positionLabel}` : ''}`.trim();
    }

    private buildExerciseLink(exercise: DayExercise): string {
        const raw = String(exercise.videoUrl || '').trim();
        if (raw) {
            if (/^https?:\/\//i.test(raw)) return raw;
            return `https://${raw}`;
        }

        const query = encodeURIComponent(`${exercise.exerciseName} ejercicio`);
        return `https://www.youtube.com/results?search_query=${query}`;
    }

    /**
     * Build notes cell combining exercise note + per-week notes (step 4)
     */
    private buildExerciseNotesCell(exercise: DayExercise): any {
        const notesStack: any[] = [];
        const baseNote = (exercise.notes || '').trim();

        if (baseNote) {
            notesStack.push({ text: baseNote, style: 'tableCell' });
        }

        const weekNotes = (exercise.weekConfigs || [])
            .filter(config => (config.notes || '').trim())
            .map(config => {
                const weekLabel = config.startWeek === config.endWeek
                    ? `Sem ${config.startWeek}`
                    : `Sem ${config.startWeek}-${config.endWeek}`;
                return `${weekLabel}: ${String(config.notes).trim()}`;
            });

        if (weekNotes.length > 0) {
            if (notesStack.length > 0) {
                notesStack.push({ text: ' ', style: 'tableCell' });
            }
            weekNotes.forEach(text => {
                notesStack.push({ text, style: 'weekNote' });
            });
        }

        if (notesStack.length === 0) {
            return { text: '-', style: 'tableCell' };
        }

        return { stack: notesStack };
    }

    /**
     * Create optional warmup section
     */
    private createWarmupSection(routine: Routine, brandColor: string): Content {
        const warmup = routine.warmup;
        const cardioExercises = warmup?.cardioExercises || [];
        const hasCustomText = !!(warmup?.customText || '').trim();

        const stack: any[] = [
            { text: 'Calentamiento', style: 'sectionTitle', margin: [0, 0, 0, 8] }
        ];

        if (cardioExercises.length > 0) {
            stack.push({
                text: `Cardio: ${cardioExercises.map(item => item.exerciseName).join(' • ')}`,
                style: 'normal',
                margin: [0, 0, 0, 4]
            });
        }

        if (hasCustomText) {
            stack.push({
                text: `Indicaciones: ${warmup?.customText}`,
                style: 'normal'
            });
        }

        return {
            table: {
                widths: [4, '*'],
                body: [[
                    { text: '', fillColor: brandColor, border: [false, false, false, false] },
                    {
                        stack,
                        fillColor: '#f8fafc',
                        margin: [10, 8, 10, 8],
                        border: [false, false, false, false]
                    }
                ]]
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0
            },
            margin: [0, 0, 0, 14]
        };
    }

    /**
     * Create footer
     */
    private createFooter(coach: Coach, currentPage: number, pageCount: number): Content {
        const generatedDate = this.formatDateForPdf(new Date());
        return {
            columns: [
                {
                    text: [
                        { text: 'Generado por ', style: 'footer' },
                        { text: coach.name, style: 'footer', bold: true },
                        ...(coach.email ? [{ text: ` | ${coach.email}`, style: 'footer' }] : []),
                        { text: ` | ${generatedDate}`, style: 'footer' }
                    ],
                    alignment: 'left'
                },
                {
                    text: `Página ${currentPage} de ${pageCount}`,
                    style: 'footer',
                    alignment: 'right'
                }
            ],
            margin: [40, 16, 40, 20]
        };
    }

    /**
     * Get PDF styles
     */
    private getStyles(brandColor: string): any {
        return {
            header: {
                fontSize: 20,
                bold: true,
                margin: [0, 0, 0, 5]
            },
            coachName: {
                fontSize: 14,
                bold: true,
                color: '#334155'
            },
            routineTitle: {
                fontSize: 24,
                bold: true,
                color: '#111827'
            },
            subheader: {
                fontSize: 16,
                bold: true,
                margin: [0, 0, 0, 5]
            },
            sectionTitle: {
                fontSize: 14,
                bold: true,
                color: '#1f2937'
            },
            dayHeader: {
                fontSize: 14,
                bold: true,
                color: brandColor,
                margin: [0, 10, 0, 4]
            },
            daySubheader: {
                fontSize: 10,
                color: '#4b5563'
            },
            tableHeader: {
                bold: true,
                fontSize: 10,
                color: '#1f2937'
            },
            tableCell: {
                fontSize: 9,
                color: '#374151'
            },
            exerciseName: {
                fontSize: 10,
                bold: true,
                color: '#111827'
            },
            supersetLabel: {
                fontSize: 8,
                italics: true,
                color: brandColor
            },
            dayNotes: {
                fontSize: 9,
                italics: true,
                color: '#4b5563'
            },
            weekNote: {
                fontSize: 8,
                italics: true,
                color: '#5f6b7b'
            },
            kpiLabel: {
                fontSize: 8,
                color: '#6b7280',
                bold: true,
                margin: [0, 0, 0, 2]
            },
            kpiValue: {
                fontSize: 12,
                color: '#111827',
                bold: true
            },
            metaText: {
                fontSize: 10,
                color: '#4b5563'
            },
            footer: {
                fontSize: 8,
                color: '#94a3b8'
            },
            normal: {
                fontSize: 10,
                color: '#374151'
            }
        };
    }

    /**
     * Fetch a logo in the representation expected by pdfmake.
     * pdfmake embeds PNG/JPEG as data URLs and SVG as markup.
     */
    private async getLogoAsset(url: string): Promise<PdfLogoAsset | null> {
        const normalizedUrl = String(url || '').trim();
        if (!normalizedUrl) return null;

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), this.imageFetchTimeoutMs);

        try {
            console.log('Fetching image for PDF:', normalizedUrl);
            const response = await fetch(normalizedUrl, { signal: controller.signal });
            if (!response.ok) {
                console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }

            const blob = await response.blob();
            const imageType = (blob.type || '').toLowerCase();
            if (blob.size > this.maxEmbeddedImageBytes) {
                console.warn(`Skipping oversized PDF logo (${blob.size} bytes).`);
                return null;
            }

            const isSvg = imageType === 'image/svg+xml' || /\.svg(\?|#|$)/i.test(normalizedUrl);
            if (isSvg) {
                const markup = await blob.text();
                if (!this.isValidSvgMarkup(markup)) {
                    console.warn('Skipping invalid SVG logo.');
                    return null;
                }
                return { kind: 'svg', markup };
            }

            if (!['image/png', 'image/jpeg', 'image/jpg'].includes(imageType)) {
                console.warn(`Skipping unsupported PDF logo type: ${imageType || 'unknown'}`);
                return null;
            }

            const dataUrl = await new Promise<string | null>((resolve) => {
                let settled = false;
                const readTimeoutId = window.setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    console.warn('Timed out reading image for PDF.');
                    resolve(null);
                }, this.imageReadTimeoutMs);

                const reader = new FileReader();
                reader.onloadend = () => {
                    if (settled) return;
                    settled = true;
                    window.clearTimeout(readTimeoutId);
                    console.log('Image converted to data URL successfully');
                    resolve(reader.result as string);
                };
                reader.onerror = () => {
                    if (settled) return;
                    settled = true;
                    window.clearTimeout(readTimeoutId);
                    console.error('Error reading image blob');
                    resolve(null);
                };
                reader.readAsDataURL(blob);
            });
            return dataUrl ? { kind: 'raster', dataUrl } : null;
        } catch (error) {
            console.error('Error preparing logo for PDF:', error);
            return null;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    private isValidSvgMarkup(markup: string): boolean {
        const trimmedMarkup = String(markup || '').trim();
        if (!trimmedMarkup) return false;

        try {
            const document = new DOMParser().parseFromString(trimmedMarkup, 'image/svg+xml');
            return document.documentElement.localName.toLowerCase() === 'svg'
                && !document.querySelector('parsererror');
        } catch {
            return false;
        }
    }
}
