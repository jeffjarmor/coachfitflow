import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { GlobalExerciseAdminService } from './global-exercise-admin.service';
import { GlobalExerciseRecord, GlobalExerciseSeed } from './global-exercise.models';
import { NEW_EXERCISES } from './data/new-exercises';
import { SPANISH_EXERCISES } from './data/spanish-exercises';

type AdminView = 'catalog' | 'seed';

@Component({
  selector: 'app-global-exercise-admin',
  standalone: true,
  imports: [ListPaginationComponent, ReactiveFormsModule, RouterLink, RouterLinkActive, CustomSelectComponent],
  templateUrl: './global-exercise-admin.component.html',
  styleUrl: './global-exercise-admin.component.scss'
})
export class GlobalExerciseAdminComponent implements OnInit {
  readonly pagination = createListPagination(() => this.filteredExercises(), () => JSON.stringify([this.query(), this.selectedGroup()]));
  readonly page = this.pagination.page;
  readonly totalPages = this.pagination.totalPages;
  readonly paginatedExercises = this.pagination.visibleItems;

  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(GlobalExerciseAdminService);

  readonly view = signal<AdminView>('catalog');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly seeding = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly query = signal('');
  readonly selectedGroup = signal('');
  readonly exercises = signal<GlobalExerciseRecord[]>([]);
  readonly editor = signal<GlobalExerciseRecord | 'new' | null>(null);
  readonly deleteTarget = signal<GlobalExerciseRecord | null>(null);
  readonly seedDialogOpen = signal(false);
  readonly seedCompleted = signal(0);
  readonly seedTotal = signal(0);
  readonly seedCatalog = this.mergeSeedCatalog();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    muscleGroup: ['', Validators.required],
    description: [''],
    videoUrl: ['', Validators.pattern(/^$|^https?:\/\//i)],
    imageUrl: ['', Validators.pattern(/^$|^(https?:\/\/|data:image\/)/i)]
  });

  readonly groups = computed(() => [...new Set(this.exercises().map((item) => item.muscleGroup))]
    .sort((a, b) => a.localeCompare(b, 'es')));
  readonly filteredExercises = computed(() => {
    const term = this.query().trim().toLocaleLowerCase('es');
    const group = this.selectedGroup();
    return this.exercises().filter((exercise) => {
      const matchesGroup = !group || exercise.muscleGroup === group;
      const searchable = `${exercise.name} ${exercise.muscleGroup} ${exercise.description || ''}`.toLocaleLowerCase('es');
      return matchesGroup && (!term || searchable.includes(term));
    });
  });
  readonly seedPercent = computed(() => this.seedTotal()
    ? Math.round((this.seedCompleted() / this.seedTotal()) * 100)
    : 0);
  readonly seedMissingCount = computed(() => {
    const existingNames = new Set(this.exercises().map((exercise) => this.normalizeName(exercise.name)));
    return this.seedCatalog.filter((exercise) => !existingNames.has(this.normalizeName(exercise.name))).length;
  });
  readonly seedExistingCount = computed(() => this.seedCatalog.length - this.seedMissingCount());

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.view.set((data['adminView'] as AdminView) || 'catalog');
      void this.load();
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.exercises.set(await this.admin.load());
      this.clampPage();
    } catch {
      this.error.set('No pudimos cargar la biblioteca global. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }

  applySearch(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  applyGroup(value: string): void {
    this.selectedGroup.set(value);
    this.page.set(1);
  }

  openCreate(): void {
    this.form.reset({ name: '', muscleGroup: '', description: '', videoUrl: '', imageUrl: '' });
    this.editor.set('new');
  }

  openEdit(exercise: GlobalExerciseRecord): void {
    this.form.reset({
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      description: exercise.description || '',
      videoUrl: exercise.videoUrl || '',
      imageUrl: exercise.imageUrl || ''
    });
    this.editor.set(exercise);
  }

  closeEditor(): void {
    if (!this.saving()) this.editor.set(null);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);
    this.error.set('');
    try {
      const current = this.editor();
      const input = this.form.getRawValue();
      if (current === 'new') {
        await this.admin.create(input);
        this.notice.set('El ejercicio global se agregó a la biblioteca.');
      } else if (current) {
        await this.admin.update(current.id, input);
        this.notice.set('Los cambios del ejercicio se guardaron.');
      }
      this.editor.set(null);
      await this.load();
    } catch {
      this.error.set('No pudimos guardar el ejercicio. Revisa los datos e inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;

    this.saving.set(true);
    this.error.set('');
    try {
      await this.admin.delete(target.id);
      this.deleteTarget.set(null);
      this.notice.set(`${target.name} se eliminó de la biblioteca global.`);
      await this.load();
    } catch (error) {
      const detail = error instanceof Error ? error.message.toLocaleLowerCase('es') : '';
      this.error.set(detail.includes('foreign key') || detail.includes('23503')
        ? 'Este ejercicio forma parte de una rutina y no se puede eliminar. Puedes editarlo sin perder las referencias.'
        : 'No pudimos eliminar el ejercicio. Inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  async seedMissing(): Promise<void> {
    this.seedDialogOpen.set(false);
    this.seeding.set(true);
    this.error.set('');
    this.notice.set('');
    this.seedCompleted.set(0);
    this.seedTotal.set(0);
    try {
      const result = await this.admin.addMissing(this.seedCatalog, (completed, total) => {
        this.seedCompleted.set(completed);
        this.seedTotal.set(total);
      });
      this.notice.set(result.added
        ? `Carga terminada: ${result.added} agregados, ${result.skipped} ya existentes. La biblioteca tiene ${result.total} ejercicios globales.`
        : `La biblioteca ya estaba actualizada. Se conservaron los ${result.skipped} ejercicios existentes.`);
      await this.load();
    } catch {
      this.error.set('La carga se interrumpió. Los ejercicios ya agregados se conservaron; puedes reintentar para completar los faltantes.');
    } finally {
      this.seeding.set(false);
    }
  }

  previousPage(): void {
    this.page.update((value) => Math.max(1, value - 1));
  }

  nextPage(): void {
    this.page.update((value) => Math.min(this.totalPages(), value + 1));
  }

  private clampPage(): void {
    if (this.page() > this.totalPages()) this.page.set(this.totalPages());
  }

  private normalizeName(name: string): string {
    return name.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private mergeSeedCatalog(): GlobalExerciseSeed[] {
    const catalog = new Map<string, GlobalExerciseSeed>();
    for (const exercise of [...SPANISH_EXERCISES, ...NEW_EXERCISES]) {
      const key = this.normalizeName(exercise.name);
      if (!catalog.has(key)) catalog.set(key, exercise);
    }
    return [...catalog.values()];
  }
}
