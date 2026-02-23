import { Injectable } from '@angular/core';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Coach } from '../models/coach.model';
import {
    CompetitorExerciseBlock,
    CompetitorSheet,
    CompetitorWorkoutSheet as Workout,
    WorkoutKey
} from '../models/competitor-sheet.model';

(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs;

interface HeaderData {
    brandColor: string;
    logoDataUrl: string | null;
    coachName: string;
    phone: string;
    email: string;
}

@Injectable({
    providedIn: 'root'
})
export class CompetitorPdfService {
    createDefaultSheet(clientId: string = ''): CompetitorSheet {
        return {
            clientId,
            mesocycleTitle: '',
            macrocycleTitle: '',
            frequencyText: '',
            splitText: '',
            trainingDaysText: '',
            programTitle: '',
            dayLabels: ['Lunes', 'Miércoles', '  Viernes'],
            weekPlans: [],
            workouts: []
        };
    }

    async generatePdf(sheet: CompetitorSheet, clientName: string, coach: Coach | null): Promise<void> {
        const headerData: HeaderData = {
            brandColor: coach?.brandColor || '#d32f2f',
            logoDataUrl: coach?.logoUrl ? await this.getImageDataUrl(coach.logoUrl) : null,
            coachName: coach?.name || 'Coach',
            phone: coach?.phone || '',
            email: coach?.email || ''
        };

        const pages: Content[] = [];

        pages.push(...this.buildControlPage(sheet, headerData));
        pages.push({ text: '', pageBreak: 'after' });

        sheet.workouts.forEach((workout, workoutIndex) => {
            const chunkSize = workout.key === 'C' ? 3 : 4;
            const chunks: CompetitorExerciseBlock[][] = [];
            for (let i = 0; i < workout.blocks.length; i += chunkSize) {
                chunks.push(workout.blocks.slice(i, i + chunkSize));
            }

            chunks.forEach((chunk, chunkIndex) => {
                pages.push(...this.buildTrainingPage(workout, chunk, headerData, sheet.programTitle));
                const isLastWorkout = workoutIndex === sheet.workouts.length - 1;
                const isLastChunk = chunkIndex === chunks.length - 1;
                if (!(isLastWorkout && isLastChunk)) {
                    pages.push({ text: '', pageBreak: 'after' });
                }
            });
        });

        const docDefinition: TDocumentDefinitions = {
            pageSize: 'A4',
            pageMargins: [22, 18, 22, 22],
            content: pages,
            styles: {
                sectionTitle: { fontSize: 12, bold: true },
                small: { fontSize: 8 },
                tiny: { fontSize: 7 },
                rowTitle: { fontSize: 8, bold: true }
            },
            defaultStyle: {
                font: 'Roboto',
                fontSize: 8
            }
        };

        const pdfDocGenerator = pdfMake.createPdf(docDefinition);
        return new Promise((resolve, reject) => {
            pdfDocGenerator.getBlob((blob) => {
                try {
                    this.downloadFile(blob, `${clientName}_competidor.pdf`);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    private buildControlPage(sheet: CompetitorSheet, header: HeaderData): Content[] {
        const content: Content[] = [];

        content.push(...this.buildHeader(header, sheet.programTitle));
        content.push({ text: sheet.mesocycleTitle, style: 'sectionTitle', margin: [0, 8, 0, 8] });

        content.push({
            table: {
                widths: [150, '*'],
                body: [
                    [{ text: 'MACROCICLO', bold: true }, sheet.macrocycleTitle],
                    [{ text: 'Frecuencia de entrenamiento', bold: true }, sheet.frequencyText],
                    [{ text: 'División grupos musculares', bold: true }, sheet.splitText],
                    [{ text: 'Días de entrenamiento', bold: true }, sheet.trainingDaysText]
                ]
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 16]
        });

        if (sheet.weekPlans.length > 0 && sheet.dayLabels.length > 0) {
            content.push({ text: 'DISTRIBUCIÓN SEMANAL', style: 'sectionTitle', margin: [0, 0, 0, 8] });

            const headerRow = [
                { text: 'SEMANA', bold: true, fillColor: '#f5f5f5' },
                ...sheet.dayLabels.map(day => ({ text: day.toUpperCase(), bold: true, fillColor: '#f5f5f5' }))
            ];

            const weekBody: any[] = [headerRow];

            sheet.weekPlans.forEach((plan) => {
                const row = [
                    { text: plan.weekLabel, bold: true },
                    ...plan.workouts.map((workout, idx) => ({ text: workout || '' }))
                ];
                // Pad if necessary
                while (row.length < headerRow.length) {
                    row.push({ text: '' });
                }
                weekBody.push(row);
            });

            const widths = ['auto', ...sheet.dayLabels.map(() => '*')];

            content.push({
                table: {
                    headerRows: 1,
                    widths,
                    body: weekBody
                },
                layout: {
                    hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
                    vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 1 : 0.5,
                    hLineColor: () => '#e0e0e0',
                    vLineColor: () => '#e0e0e0'
                } as any,
                margin: [0, 0, 0, 16]
            });
        }

        return content;
    }

    private buildTrainingPage(workout: Workout, blocks: CompetitorExerciseBlock[], header: HeaderData, programTitle?: string): Content[] {
        const content: Content[] = [];

        content.push(...this.buildHeader(header, programTitle));

        content.push({
            table: {
                widths: [120, '*', 60],
                body: [[
                    { text: workout.title, bold: true, fillColor: '#e3e3e3' },
                    { text: workout.subtitle, bold: true, fillColor: '#e3e3e3', alignment: 'center' },
                    { text: workout.code, bold: true, fillColor: '#e3e3e3', alignment: 'center' }
                ]]
            },
            layout: 'noBorders',
            margin: [0, 6, 0, 6]
        });

        const fieldRow = (label: string, fillColor?: string) => ([
            { text: label, fillColor },
            { text: '', fillColor },
            { text: '', fillColor },
            { text: '', fillColor },
            { text: '', fillColor },
            { text: '', fillColor },
            { text: '', fillColor }
        ]);

        content.push({
            table: {
                widths: [170, 56, 56, 56, 56, 56, 56],
                body: [
                    fieldRow('Fecha'),
                    fieldRow('Horas de sueño profundo'),
                    fieldRow('Días de recuperación'),
                    fieldRow('Condición psicológica:'),
                    fieldRow('1) óptima 2) buena 3) normal', '#f5f5f5'),
                    fieldRow('4) negativa 5) muy negativa', '#f5f5f5'),
                    fieldRow('Hora inicio entrenamiento'),
                    fieldRow('Hora final del entrenamiento'),
                    fieldRow('Nutrición'),
                    fieldRow('Cansancio pre entreno (1-10)')
                ]
            },
            layout: {
                hLineWidth: () => 0.6,
                vLineWidth: () => 0.6,
                hLineColor: () => '#9e9e9e',
                vLineColor: () => '#9e9e9e'
            },
            margin: [0, 0, 0, 8]
        } as any);

        blocks.forEach((block) => {
            content.push(this.buildExerciseTable(block));
            content.push({ text: '', margin: [0, 3, 0, 0] });
        });

        return content;
    }

    private buildExerciseTable(block: CompetitorExerciseBlock): Content {
        const firstCell: any = {
            stack: [{ text: block.name, bold: true }]
        };

        if (block.note) {
            firstCell.stack.push({ text: block.note, color: '#d32f2f', fontSize: 7, margin: [0, 2, 0, 0] });
        }

        const seriesRows = ['1ª serie', '2ª serie', '3ª serie', '4ª serie'];

        const body: any[] = [
            [
                firstCell,
                { text: 'MICROCICLO 1', colSpan: 2, alignment: 'center', bold: true, fillColor: '#efefef' }, {},
                { text: 'MICROCICLO 2', colSpan: 2, alignment: 'center', bold: true, fillColor: '#efefef' }, {},
                { text: 'MICROCICLO 3', colSpan: 2, alignment: 'center', bold: true, fillColor: '#efefef' }, {}
            ],
            [
                { text: '' },
                { text: 'Kg', bold: true, alignment: 'center' },
                { text: 'Rep.', bold: true, alignment: 'center' },
                { text: 'Kg', bold: true, alignment: 'center' },
                { text: 'Rep.', bold: true, alignment: 'center' },
                { text: 'Kg', bold: true, alignment: 'center' },
                { text: 'Rep.', bold: true, alignment: 'center' }
            ],
            [
                { text: 'Series / Reps', style: 'rowTitle', fillColor: '#f7f7f7' },
                { text: block.microcycles[0].series, alignment: 'center', fillColor: '#f7f7f7' },
                { text: block.microcycles[0].reps, alignment: 'center', fillColor: '#f7f7f7' },
                { text: block.microcycles[1].series, alignment: 'center', fillColor: '#f7f7f7' },
                { text: block.microcycles[1].reps, alignment: 'center', fillColor: '#f7f7f7' },
                { text: block.microcycles[2].series, alignment: 'center', fillColor: '#f7f7f7' },
                { text: block.microcycles[2].reps, alignment: 'center', fillColor: '#f7f7f7' }
            ]
        ];

        seriesRows.forEach((rowLabel) => {
            body.push([
                { text: rowLabel }, '', '', '', '', '', ''
            ]);
        });

        body.push([
            { text: 'Tiempo de pausa entre series', style: 'small' },
            { text: block.rest[0], alignment: 'center', fillColor: '#f7f7f7' },
            '',
            { text: block.rest[1], alignment: 'center', fillColor: '#f7f7f7' },
            '',
            { text: block.rest[2], alignment: 'center', fillColor: '#f7f7f7' },
            ''
        ]);

        return {
            table: {
                widths: [170, 56, 56, 56, 56, 56, 56],
                body
            },
            layout: {
                hLineWidth: () => 0.6,
                vLineWidth: () => 0.6,
                hLineColor: () => '#9e9e9e',
                vLineColor: () => '#9e9e9e'
            }
        } as any;
    }

    private buildHeader(data: HeaderData, programTitle?: string): Content[] {
        const logoContent: Content = data.logoDataUrl
            ? {
                image: data.logoDataUrl,
                fit: [62, 62],
                margin: [0, 0, 0, 0]
            }
            : {
                table: {
                    widths: [62],
                    body: [[{ text: data.coachName.slice(0, 2).toUpperCase(), alignment: 'center', bold: true, margin: [0, 20, 0, 20] }]]
                },
                layout: {
                    hLineColor: () => data.brandColor,
                    vLineColor: () => data.brandColor,
                    hLineWidth: () => 1,
                    vLineWidth: () => 1
                }
            };

        return [
            {
                columns: [
                    { width: 70, stack: [logoContent] },
                    {
                        width: '*',
                        stack: [
                            { text: programTitle || 'CENTRE D\'ENTRENAMENT PERSONAL', bold: true, alignment: 'center', fontSize: 12 },
                            { text: data.coachName, alignment: 'center', color: data.brandColor, margin: [0, 3, 0, 0] }
                        ]
                    },
                    {
                        width: 170,
                        stack: [
                            { text: data.phone || 'Sin teléfono', alignment: 'right' },
                            { text: data.email || 'Sin correo', alignment: 'right' }
                        ]
                    }
                ],
                margin: [0, 0, 0, 4]
            },
            {
                canvas: [
                    {
                        type: 'line',
                        x1: 0,
                        y1: 0,
                        x2: 550,
                        y2: 0,
                        lineWidth: 2,
                        lineColor: data.brandColor
                    }
                ],
                margin: [0, 0, 0, 4]
            }
        ];
    }

    private async getImageDataUrl(url: string): Promise<string | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                return null;
            }
            const blob = await response.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Error leyendo logo'));
                reader.readAsDataURL(blob);
            });
        } catch {
            return null;
        }
    }

    private downloadFile(blob: Blob, fileName: string): void {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 100);
    }
}
