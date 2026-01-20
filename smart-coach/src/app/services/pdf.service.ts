import { Injectable, inject } from '@angular/core';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { RoutineWithDays, DayExercise, Routine, TrainingDay } from '../models/routine.model';
import { Coach } from '../models/coach.model';
import { Client } from '../models/client.model';

// Initialize pdfMake with fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs;

@Injectable({
    providedIn: 'root'
})
export class PdfService {

    /**
     * Generate and download routine PDF
     */
    async generateRoutinePDF(
        routine: RoutineWithDays,
        client: Client,
        coach: Coach
    ): Promise<void> {
        try {
            const docDefinition = await this.createDocumentDefinition(routine, client, coach);
            pdfMake.createPdf(docDefinition).download(`${client.name}_${routine.name}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw error;
        }
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

        // Header with coach logo and info
        content.push(await this.createHeader(coach, routine, client));

        // Client info section
        content.push(this.createClientInfo(client, routine));

        // Training days
        for (const day of routine.days) {
            content.push(this.createDaySection(day));
        }

        // Footer
        content.push(this.createFooter(coach));

        return {
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            content,
            styles: this.getStyles(coach.brandColor || '#2196f3'),
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
        const header: any = {
            columns: [],
            margin: [0, 0, 0, 20]
        };

        // Add logo if available
        if (coach.logoUrl) {
            const logoDataUrl = await this.getImageDataUrl(coach.logoUrl);
            if (logoDataUrl) {
                header.columns.push({
                    image: logoDataUrl,
                    width: 60,
                    height: 60
                });
            }
        }

        // Coach and routine info
        header.columns.push({
            stack: [
                { text: coach.name, style: 'header', color: coach.brandColor || '#2196f3' },
                { text: routine.name, style: 'subheader' },
                { text: `Cliente: ${client.name}`, style: 'normal', margin: [0, 5, 0, 0] },
                { text: `Objetivo: ${routine.objective}`, style: 'normal' }
            ],
            margin: [coach.logoUrl ? 15 : 0, 0, 0, 0]
        });

        return header;
    }

    /**
     * Create client info section
     */
    private createClientInfo(client: Client, routine: Routine): Content {
        return {
            table: {
                widths: ['*', '*', '*', '*'],
                body: [
                    [
                        { text: 'Edad', style: 'tableHeader' },
                        { text: 'Peso', style: 'tableHeader' },
                        { text: 'Altura', style: 'tableHeader' },
                        { text: 'Días de Entrenamiento', style: 'tableHeader' }
                    ],
                    [
                        { text: `${client.age} años`, style: 'tableCell' },
                        { text: `${client.weight} kg`, style: 'tableCell' },
                        { text: `${client.height} cm`, style: 'tableCell' },
                        { text: `${routine.trainingDaysCount} días/semana`, style: 'tableCell' }
                    ]
                ]
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 20]
        };
    }

    /**
     * Create training day section
     */
    private createDaySection(day: TrainingDay): Content {
        const dayContent: Content[] = [];

        // Day header - Replace "Day" with "Día" for legacy routines
        const muscleGroupsText = Array.isArray(day.muscleGroups)
            ? day.muscleGroups.join(', ')
            : (day.muscleGroups || '');

        // Replace "Day" with "Día" in case we have legacy data
        const dayNameInSpanish = day.dayName.replace(/^Day\s+/i, 'Día ');

        dayContent.push({
            text: `${dayNameInSpanish} - ${muscleGroupsText}`,
            style: 'dayHeader',
            margin: [0, 15, 0, 10]
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
                            ...(exercise.videoUrl && {
                                link: exercise.videoUrl,
                                color: '#2196f3',
                                decoration: 'underline'
                            })
                        },
                        ...(exercise.isSuperset ? [{ text: '(Superserie)', style: 'supersetLabel' }] : [])
                    ]
                },
                setsContent,
                repsContent,
                restContent,
                { text: exercise.notes || '-', style: 'tableCell' }
            ];

            tableBody.push(row);
        }

        dayContent.push({
            table: {
                widths: ['*', 70, 70, 60, 100], // Increased widths for progressive overload
                body: tableBody
            },
            layout: {
                fillColor: (rowIndex: number) => {
                    return rowIndex === 0 ? '#f5f5f5' : null;
                },
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => '#e0e0e0',
                vLineColor: () => '#e0e0e0',
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

    /**
     * Create footer
     */
    private createFooter(coach: Coach): Content {
        return {
            text: [
                { text: 'Generado por ', style: 'footer' },
                { text: coach.name, style: 'footer', bold: true },
                ...(coach.phone ? [{ text: ` | ${coach.phone}`, style: 'footer' }] : []),
                ...(coach.email ? [{ text: ` | ${coach.email}`, style: 'footer' }] : [])
            ],
            margin: [0, 30, 0, 0],
            alignment: 'center'
        };
    }

    /**
     * Get PDF styles
     */
    private getStyles(brandColor: string): any {
        return {
            header: {
                fontSize: 22,
                bold: true,
                margin: [0, 0, 0, 5]
            },
            subheader: {
                fontSize: 16,
                bold: true,
                margin: [0, 0, 0, 5]
            },
            dayHeader: {
                fontSize: 14,
                bold: true,
                color: brandColor,
                fillColor: '#f5f5f5',
                margin: [0, 10, 0, 10]
            },
            tableHeader: {
                bold: true,
                fontSize: 10,
                color: '#424242',
                fillColor: '#f5f5f5'
            },
            tableCell: {
                fontSize: 9,
                color: '#616161'
            },
            exerciseName: {
                fontSize: 10,
                bold: true,
                color: '#212121'
            },
            supersetLabel: {
                fontSize: 8,
                italics: true,
                color: brandColor
            },
            dayNotes: {
                fontSize: 9,
                italics: true,
                color: '#757575'
            },
            footer: {
                fontSize: 9,
                color: '#9e9e9e'
            },
            normal: {
                fontSize: 10,
                color: '#616161'
            }
        };
    }

    /**
     * Convert image URL to data URL for embedding in PDF
     */
    private async getImageDataUrl(url: string): Promise<string | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => {
                    console.warn('Error reading image blob');
                    resolve(null);
                };
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.warn('Error converting image to data URL (likely CORS or network issue):', error);
            return null;
        }
    }
}
