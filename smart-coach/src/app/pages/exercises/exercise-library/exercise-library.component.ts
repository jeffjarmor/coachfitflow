import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';
import { ExerciseService } from '../../../services/exercise.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmService } from '../../../services/confirm.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { TutorialButtonComponent } from '../../../components/tutorial/tutorial-button/tutorial-button.component';
import { TutorialService } from '../../../services/tutorial.service';
import { CoachService } from '../../../services/coach.service'; // Added import
import { Exercise } from '../../../models/exercise.model';
import { MUSCLE_GROUPS } from '../../../utils/muscle-groups';

@Component({
    selector: 'app-exercise-library',
    standalone: true,
    imports: [CommonModule, RouterLink, ReactiveFormsModule, ButtonComponent, PageHeaderComponent, TutorialButtonComponent],
    templateUrl: './exercise-library.component.html',
    styleUrls: ['./exercise-library.component.scss']
})
export class ExerciseLibraryComponent {
    readonly placeholderImageUrl = this.createMinimalFallback();
    private generatedImageCache = new Map<string, string>();
    private exerciseService = inject(ExerciseService);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private confirmService = inject(ConfirmService);
    private tutorialService = inject(TutorialService);
    private coachService = inject(CoachService); // Added inject

    // Constants
    muscleGroups = MUSCLE_GROUPS;

    // State
    activeTab = signal<'global' | 'my-exercises'>('global');
    loading = signal<boolean>(false);
    isGymMode = signal<boolean>(false); // Added signal


    // Search & Filter
    searchControl = new FormControl('');
    muscleGroupControl = new FormControl('');

    searchQuery = toSignal(
        this.searchControl.valueChanges.pipe(
            startWith(''),
            debounceTime(300),
            distinctUntilChanged()
        ),
        { initialValue: '' }
    );

    selectedMuscleGroup = toSignal(
        this.muscleGroupControl.valueChanges,
        { initialValue: '' }
    );

    // Data
    globalExercises = this.exerciseService.globalExercises;
    coachExercises = this.exerciseService.coachExercises;

    // Computed filtered exercises based on active tab
    filteredExercises = computed(() => {
        const query = this.searchQuery()?.toLowerCase() || '';
        const muscleGroup = this.selectedMuscleGroup();
        const tab = this.activeTab();

        const exercises = tab === 'global' ? this.globalExercises() : this.coachExercises();

        return exercises.filter(ex => {
            const matchesSearch = ex.name.toLowerCase().includes(query) ||
                (ex.description && ex.description.toLowerCase().includes(query));
            const matchesMuscle = !muscleGroup || ex.muscleGroup === muscleGroup;

            return matchesSearch && matchesMuscle;
        });
    });

    constructor() {
        this.loadData();


    }

    async loadData() {
        try {
            this.loading.set(true);
            await this.authService.waitForAuthReady();
            const userId = this.authService.getCurrentUserId();

            // Prepare fetch promises
            const promises: Promise<any>[] = [
                this.exerciseService.getGlobalExercises()
            ];

            if (userId) {
                // Get coach profile to determine gymId
                const coach = await this.coachService.getCoachProfile(userId);
                const gymId = coach?.gymId || undefined; // Ensure undefined if null

                this.isGymMode.set(!!gymId); // Set gym mode

                console.log('Loading library for coach:', userId, 'gymId:', gymId);
                promises.push(this.exerciseService.getCoachExercises(userId, gymId));
            } else {
                promises.push(Promise.resolve([]));
            }

            // Load both lists
            await Promise.all(promises);
        } catch (error) {
            console.error('Error loading exercises:', error);
        } finally {
            this.loading.set(false);
        }
    }

    setActiveTab(tab: 'global' | 'my-exercises') {
        this.activeTab.set(tab);
        // Reset filters when switching tabs? Optional.
        // this.searchControl.setValue('');
        // this.muscleGroupControl.setValue('');
    }

    async deleteExercise(exerciseId: string, event: Event) {
        event.preventDefault();
        event.stopPropagation();

        const confirmed = await this.confirmService.confirm({
            title: '¿Eliminar ejercicio?',
            message: '¿Estás seguro de que quieres eliminar este ejercicio?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            await this.exerciseService.deleteExercise(exerciseId);
            this.toastService.success('Ejercicio eliminado correctamente');
        } catch (error) {
            console.error('Error deleting exercise:', error);
            this.toastService.error('Error al eliminar el ejercicio');
        }
    }

    startTutorial() {
        this.tutorialService.startTutorial('exercise-library');
    }

    getExerciseImage(exercise: Exercise): string {
        if (exercise.imageUrl?.trim()) return exercise.imageUrl;

        const key = `${exercise.name}|${exercise.muscleGroup}`;
        const cached = this.generatedImageCache.get(key);
        if (cached) return cached;

        const generated = this.createExerciseIllustration(exercise.name, exercise.muscleGroup);
        this.generatedImageCache.set(key, generated);
        return generated;
    }

    onImageError(event: Event): void {
        const img = event.target as HTMLImageElement | null;
        if (!img) return;
        if (img.src.startsWith('data:image/svg+xml')) return;
        img.src = this.placeholderImageUrl;
    }

    private createExerciseIllustration(name: string, muscleGroup: string): string {
        const group = (muscleGroup || '').toLowerCase();
        const palette = this.paletteForGroup(group);
        const scene = this.sceneForExercise(name, group, palette);

        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0e14"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1c212a"/>
      <stop offset="50%" stop-color="#232a36"/>
      <stop offset="100%" stop-color="#1c212a"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <rect x="46" y="46" width="868" height="448" rx="28" fill="#1c212a" stroke="#2f3948" stroke-width="2"/>
  <rect x="46" y="46" width="868" height="8" fill="${palette.accent}"/>
  <rect x="90" y="94" width="780" height="350" rx="22" fill="#121925"/>
  <rect x="90" y="390" width="780" height="54" rx="14" fill="url(#floor)"/>
  <circle cx="480" cy="240" r="140" fill="${palette.glow}" opacity="0.18"/>
  ${scene}
</svg>`.trim();

        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    private createMinimalFallback(): string {
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#0b0e14"/>
  <rect x="46" y="46" width="868" height="448" rx="28" fill="#1c212a" stroke="#2f3948" stroke-width="2"/>
  <rect x="90" y="94" width="780" height="350" rx="22" fill="#121925"/>
  <rect x="90" y="390" width="780" height="54" rx="14" fill="#1c212a"/>
  <circle cx="480" cy="170" r="26" fill="#ffcf99"/>
  <path d="M480 196v82M480 228l-52 40M480 228l52 40M480 278l-42 82M480 278l42 82" stroke="#4f46e5" stroke-width="16" stroke-linecap="round"/>
  <circle cx="438" cy="362" r="10" fill="#f59e0b"/><circle cx="522" cy="362" r="10" fill="#f59e0b"/>
</svg>`.trim();
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    private paletteForGroup(group: string): { accent: string; glow: string } {
        if (group.includes('pecho')) return { accent: '#ccff00', glow: '#ccff00' };
        if (group.includes('espalda')) return { accent: '#75abff', glow: '#75abff' };
        if (group.includes('hombro')) return { accent: '#ffb84d', glow: '#ffb84d' };
        if (group.includes('bíce') || group.includes('bicep')) return { accent: '#6ee74b', glow: '#6ee74b' };
        if (group.includes('tríce') || group.includes('tricep')) return { accent: '#9fc3ff', glow: '#9fc3ff' };
        if (group.includes('cuádr') || group.includes('quadr')) return { accent: '#ccff00', glow: '#ccff00' };
        if (group.includes('isquio')) return { accent: '#6ee74b', glow: '#6ee74b' };
        if (group.includes('glú') || group.includes('glut')) return { accent: '#ff8080', glow: '#ff8080' };
        if (group.includes('pantorr')) return { accent: '#ffd08a', glow: '#ffd08a' };
        if (group.includes('core')) return { accent: '#9fce00', glow: '#9fce00' };
        if (group.includes('cardio')) return { accent: '#ff4c4c', glow: '#ff4c4c' };
        if (group.includes('potencia')) return { accent: '#ffb84d', glow: '#ffb84d' };
        if (group.includes('rehabil')) return { accent: '#8c95a4', glow: '#8c95a4' };
        return { accent: '#ccff00', glow: '#75abff' };
    }

    private sceneForExercise(name: string, group: string, palette: { accent: string; glow: string }): string {
        const n = `${name} ${group}`.toLowerCase();
        const body = '#4f46e5';
        const skin = '#ffcf99';
        const short = '#f59e0b';
        const steel = '#94a3b8';
        const dark = '#334155';

        if (/(press de banca|bench|press.*plano|press.*inclinado|press.*declinado)/.test(n)) {
            return `
<rect x="340" y="318" width="280" height="16" rx="8" fill="${dark}"/>
<rect x="450" y="248" width="60" height="70" rx="10" fill="${body}"/>
<circle cx="480" cy="218" r="20" fill="${skin}"/>
<path d="M450 272h-52M510 272h52" stroke="${skin}" stroke-width="12" stroke-linecap="round"/>
<path d="M372 256h216" stroke="${steel}" stroke-width="12" stroke-linecap="round"/>
<circle cx="354" cy="256" r="18" fill="${palette.accent}"/><circle cx="606" cy="256" r="18" fill="${palette.accent}"/>
<rect x="402" y="334" width="20" height="48" rx="10" fill="${short}"/><rect x="538" y="334" width="20" height="48" rx="10" fill="${short}"/>`;
        }
        if (/(sentadilla|squat|zancada|lunge|prensa|pistol|hack|step-up|step up)/.test(n)) {
            return `
<circle cx="470" cy="170" r="22" fill="${skin}"/>
<path d="M470 194v86M470 228l58 30M470 228l-56 34" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M470 280l-70 72M470 280l66 18" stroke="${short}" stroke-width="16" stroke-linecap="round"/>
<rect x="324" y="356" width="112" height="16" rx="8" fill="${dark}"/>
<rect x="530" y="318" width="120" height="16" rx="8" fill="${dark}"/>
<circle cx="560" cy="184" r="14" fill="${palette.accent}"/><circle cx="582" cy="184" r="14" fill="${palette.accent}"/>`;
        }
        if (/(peso muerto|deadlift|remo|row|pendlay|t-bar|rack pull|kroc)/.test(n)) {
            return `
<circle cx="470" cy="168" r="20" fill="${skin}"/>
<path d="M470 190l-22 74M448 264l96 24M470 226l54 18" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M430 306h190" stroke="${steel}" stroke-width="12" stroke-linecap="round"/>
<circle cx="406" cy="306" r="18" fill="${palette.accent}"/><circle cx="642" cy="306" r="18" fill="${palette.accent}"/>
<path d="M448 264l-36 82M544 288l32 64" stroke="${short}" stroke-width="16" stroke-linecap="round"/>`;
        }
        if (/(jal[oó]n|lat pulldown|dominada|pull-up|pull up|chin-up|chin up)/.test(n)) {
            return `
<path d="M350 130h260" stroke="${steel}" stroke-width="12" stroke-linecap="round"/>
<path d="M392 130v40M568 130v40" stroke="${steel}" stroke-width="8"/>
<circle cx="480" cy="210" r="20" fill="${skin}"/>
<path d="M480 230v88M480 254l-70-34M480 254l70-34" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M480 318l-40 72M480 318l40 72" stroke="${short}" stroke-width="16" stroke-linecap="round"/>`;
        }
        if (/(curl|b[ií]cep|tr[ií]cep|kickback|extensi[oó]n|jm|martillo|predicador|spider)/.test(n)) {
            return `
<circle cx="480" cy="166" r="22" fill="${skin}"/>
<path d="M480 190v102M480 228l-58 24M480 228l58 24" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<circle cx="410" cy="262" r="12" fill="${palette.accent}"/><circle cx="550" cy="262" r="12" fill="${palette.accent}"/>
<path d="M480 292l-40 82M480 292l40 82" stroke="${short}" stroke-width="16" stroke-linecap="round"/>`;
        }
        if (/(press militar|overhead|arnold|elevaciones|hombro|push press)/.test(n)) {
            return `
<circle cx="480" cy="172" r="20" fill="${skin}"/>
<path d="M480 194v98M480 220l-62-34M480 220l62-34" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M400 178h160" stroke="${steel}" stroke-width="10" stroke-linecap="round"/>
<circle cx="388" cy="178" r="14" fill="${palette.accent}"/><circle cx="572" cy="178" r="14" fill="${palette.accent}"/>
<path d="M480 292l-40 82M480 292l40 82" stroke="${short}" stroke-width="16" stroke-linecap="round"/>`;
        }
        if (/(plancha|crunch|abdominal|core|twist|l-sit|v-up|toes to bar|pallof|sit-up|sit up)/.test(n)) {
            return `
<rect x="308" y="340" width="344" height="14" rx="7" fill="${dark}"/>
<circle cx="410" cy="270" r="20" fill="${skin}"/>
<path d="M428 280h120M548 280l40 46" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M548 280l26-46" stroke="${short}" stroke-width="16" stroke-linecap="round"/>
<circle cx="598" cy="338" r="10" fill="${short}"/>`;
        }
        if (/(cardio|sprint|correr|bici|el[ií]ptica|hiit|burpee|jump|jumping|escaladora)/.test(n)) {
            return `
<rect x="330" y="324" width="300" height="16" rx="8" fill="${dark}"/>
<circle cx="452" cy="184" r="20" fill="${skin}"/>
<path d="M452 206l40 44M492 250l76-8M492 250l-42 68M568 242l44 56" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M450 318l-52 34M612 298l34 28" stroke="${short}" stroke-width="16" stroke-linecap="round"/>`;
        }
        if (/(rehabil|movilidad|rotaci[oó]n|estiramiento|band|wall slides|cat-cow|gato-vaca)/.test(n)) {
            return `
<circle cx="480" cy="166" r="20" fill="${skin}"/>
<path d="M480 188v102M480 224l-66 16M480 224l66-16" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M480 290l-36 84M480 290l36 84" stroke="${short}" stroke-width="16" stroke-linecap="round"/>
<path d="M384 236c34-18 58-18 96 0" stroke="${palette.accent}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
        }
        if (/(snatch|clean|jerk|thruster|power|potencia|ol[ií]mpic)/.test(n)) {
            return `
<circle cx="480" cy="170" r="20" fill="${skin}"/>
<path d="M480 192v98M480 220l-72-18M480 220l72-18" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M370 188h220" stroke="${steel}" stroke-width="12" stroke-linecap="round"/>
<circle cx="346" cy="188" r="18" fill="${palette.accent}"/><circle cx="614" cy="188" r="18" fill="${palette.accent}"/>
<path d="M480 290l-34 84M480 290l44 84" stroke="${short}" stroke-width="16" stroke-linecap="round"/>`;
        }

        return `
<circle cx="480" cy="170" r="20" fill="${skin}"/>
<path d="M480 192v98M480 226l-56 22M480 226l56 22" stroke="${body}" stroke-width="16" stroke-linecap="round"/>
<path d="M480 290l-36 84M480 290l36 84" stroke="${short}" stroke-width="16" stroke-linecap="round"/>
<circle cx="424" cy="252" r="10" fill="${palette.accent}"/><circle cx="536" cy="252" r="10" fill="${palette.accent}"/>`;
    }

    private initials(name: string): string {
        const parts = (name || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return 'EX';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    private escapeXml(value: string): string {
        return (value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
