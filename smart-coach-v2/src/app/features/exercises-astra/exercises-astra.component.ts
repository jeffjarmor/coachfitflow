import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';

import { Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fadeOutModal } from '../../shared/modal-motion';
import { ExerciseLibraryComponent } from '../exercises/exercise-library.component';
import { ExerciseItem } from '../../core/data/coach-data.service';
import { COLLECTIONS, hasExercisePhoto, referenceImage, safeVideoUrl } from './exercise-media';
import { resolveGlobalExerciseImage } from '../../shared/global-exercise-media';

@Component({
  selector: 'app-exercises-astra',
  standalone: true,
  imports: [ListPaginationComponent, FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './exercises-astra.component.html',
  styleUrl: './exercises-astra.component.scss'
})
export class ExercisesAstraComponent extends ExerciseLibraryComponent {
  private readonly detailRouter = inject(Router);
  readonly catalogPagination = createListPagination(() => this.visibleExercises(), () => JSON.stringify([this.query(), this.selectedMuscleGroup(), this.activeTab(), this.collection(), this.sort()]));

  @ViewChild('detailDialog') private detailDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('deleteDialog') private deleteDialog!: ElementRef<HTMLDialogElement>;
  readonly collection = signal('');
  readonly sort = signal('name');
  readonly selected = signal<ExerciseItem | null>(null);
  // Mantiene el texto visible durante el fade aunque se limpie el objetivo de borrado.
  readonly deleteDialogName = signal('');
  readonly brokenImages = signal(new Set<string>());
  readonly collections = COLLECTIONS;
  readonly videoUrl = safeVideoUrl;
  readonly collectionCounts = computed(() => this.collections.map((collection) => ({
    ...collection,
    count: this.exercises().filter((exercise) => exercise.source === this.activeTab() && collection.groups.includes(exercise.muscleGroup)).length
  })));
  readonly groupOptions = computed(() => [...new Set([...this.muscleGroups, ...this.exercises().map((exercise) => exercise.muscleGroup)])].sort((a, b) => a.localeCompare(b, 'es')));
  readonly hasFilters = computed(() => this.filtersActive() || !!this.collection());
  readonly visibleExercises = computed(() => {
    const category = this.collections.find((entry) => entry.id === this.collection());
    const items = this.filteredExercises().filter((exercise) => !category || category.groups.includes(exercise.muscleGroup));
    return [...items].sort((a, b) => this.sort() === 'recent'
      ? (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0)
      : a.name.localeCompare(b.name, 'es'));
  });

  selectCollection(id: string): void {
    this.collection.set(this.collection() === id ? '' : id);
    this.selectedMuscleGroup.set('');
  }

  selectMuscle(group: string): void {
    this.selectedMuscleGroup.set(group);
    this.collection.set('');
  }

  override clearFilters(): void {
    super.clearFilters();
    this.collection.set('');
  }

  isReference(exercise: ExerciseItem): boolean {
    return this.brokenImages().has(exercise.id) || (!resolveGlobalExerciseImage(exercise) && !hasExercisePhoto(exercise));
  }

  override imageFor(exercise: ExerciseItem): string {
    return this.isReference(exercise)
      ? referenceImage(exercise.muscleGroup)
      : resolveGlobalExerciseImage(exercise) || exercise.imageUrl!;
  }

  override onImageError(_event: Event, exercise: ExerciseItem): void {
    this.brokenImages.update((ids) => new Set([...ids, exercise.id]));
  }

  openDetail(exercise: ExerciseItem): void {
    this.selected.set(exercise);
    this.detailDialog.nativeElement.showModal();
  }

  closeDetail(): void { this.detailDialog.nativeElement.close(); }

  async editFromDetail(event: MouseEvent, exercise: ExerciseItem): Promise<void> {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    await fadeOutModal(this.detailDialog.nativeElement);
    await this.detailRouter.navigate([this.libraryRoute, exercise.id, 'edit']);
  }

  override requestDelete(exercise: ExerciseItem): void {
    this.deleteDialogName.set(exercise.name);
    super.requestDelete(exercise);
    this.deleteDialog.nativeElement.showModal();
  }

  override closeDeleteDialog(): void {
    if (this.deleting()) return;
    super.closeDeleteDialog();
    this.deleteDialog.nativeElement.close();
  }

  override async confirmDelete(): Promise<void> {
    await super.confirmDelete();
    this.deleteDialog.nativeElement.close();
    this.closeDetail();
  }

  tabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tab = event.key === 'Home' ? 'global' : event.key === 'End' ? 'coach' : this.activeTab() === 'global' ? 'coach' : 'global';
    this.setActiveTab(tab);
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.focus();
  }
}
