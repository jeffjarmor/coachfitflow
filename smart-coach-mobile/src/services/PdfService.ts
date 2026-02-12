import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { RoutineWithDays } from '../types/Routine';
import { Client } from '../types/Client';

// Simplified coach interface for PDF generation
interface PdfCoach {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    brandColor?: string;
    logoUrl?: string;
}

class PdfService {
    /**
     * Generate and share routine PDF using expo-print
     */
    async generateRoutinePDF(
        routine: RoutineWithDays,
        client: Client,
        coach: PdfCoach
    ): Promise<void> {
        try {
            console.log('=== PDF Generation Debug ===');
            console.log('Client data:', JSON.stringify(client, null, 2));
            console.log('Routine data:', JSON.stringify(routine, null, 2));
            console.log('Sample exercise:', routine.days[0]?.exercises[0]);

            const html = this.createHtmlContent(routine, client, coach);

            const { uri } = await Print.printToFileAsync({ html });
            console.log('PDF created at:', uri);

            // Share the PDF
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    mimeType: 'application/pdf',
                    dialogTitle: `${client.name}_${routine.name}.pdf`,
                    UTI: 'com.adobe.pdf',
                });
            } else {
                console.log('Sharing not available on this device');
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw error;
        }
    }

    /**
     * Create HTML content for PDF
     */
    private createHtmlContent(
        routine: RoutineWithDays,
        client: Client,
        coach: PdfCoach
    ): string {
        const brandColor = coach.brandColor || '#2196f3';

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            font-size: 10pt;
            color: #616161;
            padding: 40px;
        }
        .header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            border-bottom: 2px solid ${brandColor};
            padding-bottom: 15px;
        }
        .header-logo {
            width: 60px;
            height: 60px;
            margin-right: 15px;
            object-fit: contain;
        }
        .header-info h1 {
            color: ${brandColor};
            font-size: 22pt;
            margin-bottom: 5px;
        }
        .header-info h2 {
            font-size: 16pt;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .header-info p {
            margin: 3px 0;
        }
        .client-info {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        .client-info th {
            background-color: #f5f5f5;
            padding: 8px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #e0e0e0;
        }
        .client-info td {
            padding: 8px;
            border: 1px solid #e0e0e0;
        }
        .day-section {
            page-break-inside: avoid;
            margin-bottom: 25px;
        }
        .day-header {
            background-color: #f5f5f5;
            color: ${brandColor};
            font-size: 14pt;
            font-weight: bold;
            padding: 10px;
            margin: 15px 0 10px 0;
        }
        .exercises-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
        }
        .exercises-table th {
            background-color: #f5f5f5;
            padding: 8px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #e0e0e0;
            font-size: 10pt;
        }
        .exercises-table td {
            padding: 8px;
            border: 1px solid #e0e0e0;
            font-size: 9pt;
        }
        .exercise-name {
            font-weight: bold;
            color: #212121;
            font-size: 10pt;
        }
        .exercise-link {
            color: #2196f3;
            font-size: 8pt;
            word-break: break-all;
            margin-top: 3px;
        }
        .superset-label {
            font-style: italic;
            color: ${brandColor};
            font-size: 8pt;
        }
        .week-config {
            font-size: 8pt;
            color: #616161;
            margin: 2px 0;
        }
        .day-notes {
            font-style: italic;
            color: #757575;
            margin-top: 5px;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e0e0e0;
            color: #9e9e9e;
            font-size: 9pt;
        }
    </style>
</head>
<body>
    ${this.createHeaderHtml(coach, routine, client, brandColor)}
    ${this.createClientInfoHtml(client, routine)}
    ${routine.days.map(day => this.createDaySectionHtml(day)).join('')}
    ${this.createFooterHtml(coach)}
</body>
</html>
        `;
    }

    private createHeaderHtml(coach: PdfCoach, routine: RoutineWithDays, client: Client, brandColor: string): string {
        return `
<div class="header">
    ${coach.logoUrl ? `<img class="header-logo" src="${coach.logoUrl}" alt="Logo" />` : ''}
    <div class="header-info">
        <h1>${coach.name}</h1>
        <h2>${routine.name}</h2>
        <p><strong>Cliente:</strong> ${client.name}</p>
        <p><strong>Objetivo:</strong> ${routine.objective}</p>
    </div>
</div>
        `;
    }

    private createClientInfoHtml(client: Client, routine: RoutineWithDays): string {
        const age = client.age !== undefined && client.age !== null ? client.age : '-';
        const weight = client.weight !== undefined && client.weight !== null ? client.weight : '-';
        const height = client.height !== undefined && client.height !== null ? client.height : '-';

        return `
<table class="client-info">
    <tr>
        <th>Edad</th>
        <th>Peso</th>
        <th>Altura</th>
        <th>Días de Entrenamiento</th>
    </tr>
    <tr>
        <td>${age} años</td>
        <td>${weight} kg</td>
        <td>${height} cm</td>
        <td>${routine.trainingDaysCount} días/semana</td>
    </tr>
</table>
        `;
    }

    private createDaySectionHtml(day: any): string {
        const muscleGroupsText = Array.isArray(day.muscleGroups)
            ? day.muscleGroups.join(', ')
            : (day.muscleGroups || '');

        const dayNameInSpanish = day.dayName.replace(/^Day\s+/i, 'Día ');

        return `
<div class="day-section">
    <div class="day-header">${dayNameInSpanish} - ${muscleGroupsText}</div>
    <table class="exercises-table">
        <thead>
            <tr>
                <th>Ejercicio</th>
                <th>Series</th>
                <th>Reps</th>
                <th>Descanso</th>
                <th>Notas</th>
            </tr>
        </thead>
        <tbody>
            ${(day.exercises || []).map((ex: any) => this.createExerciseRowHtml(ex)).join('')}
        </tbody>
    </table>
    ${day.notes ? `<div class="day-notes">Notas: ${day.notes}</div>` : ''}
</div>
        `;
    }

    private createExerciseRowHtml(exercise: any): string {
        let setsContent = exercise.sets.toString();
        let repsContent = exercise.reps;
        let restContent = exercise.rest;

        if (exercise.weekConfigs && exercise.weekConfigs.length > 0) {
            setsContent = exercise.weekConfigs.map((config: any) => {
                const weekLabel = config.startWeek === config.endWeek
                    ? `Sem ${config.startWeek}`
                    : `Sem ${config.startWeek}-${config.endWeek}`;
                return `<div class="week-config">${weekLabel}: ${config.sets}</div>`;
            }).join('');

            repsContent = exercise.weekConfigs.map((config: any) => {
                const weekLabel = config.startWeek === config.endWeek
                    ? `Sem ${config.startWeek}`
                    : `Sem ${config.startWeek}-${config.endWeek}`;
                return `<div class="week-config">${weekLabel}: ${config.reps}</div>`;
            }).join('');

            restContent = exercise.weekConfigs.map((config: any) => {
                const weekLabel = config.startWeek === config.endWeek
                    ? `Sem ${config.startWeek}`
                    : `Sem ${config.startWeek}-${config.endWeek}`;
                return `<div class="week-config">${weekLabel}: ${config.rest}</div>`;
            }).join('');
        }

        // Check both videoUrl and defaultVideoUrl
        const videoLink = exercise.videoUrl || exercise.defaultVideoUrl;

        // Show exercise name + URL as plain text below
        const exerciseNameHtml = videoLink
            ? `<div class="exercise-name">${exercise.exerciseName}</div><div class="exercise-link">${videoLink}</div>`
            : `<div class="exercise-name">${exercise.exerciseName}</div>`;

        return `
<tr>
    <td>
        ${exerciseNameHtml}
        ${exercise.isSuperset ? '<div class="superset-label">(Superserie)</div>' : ''}
    </td>
    <td>${setsContent}</td>
    <td>${repsContent}</td>
    <td>${restContent}</td>
    <td>${exercise.notes || '-'}</td>
</tr>
        `;
    }

    private createFooterHtml(coach: PdfCoach): string {
        return `
<div class="footer">
    Generado por <strong>${coach.name}</strong>${coach.phone ? ` | ${coach.phone}` : ''}${coach.email ? ` | ${coach.email}` : ''}
</div>
        `;
    }
}

export const pdfService = new PdfService();
