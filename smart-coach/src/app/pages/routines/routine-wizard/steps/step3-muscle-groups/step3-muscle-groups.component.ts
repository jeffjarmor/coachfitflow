import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RoutineService } from '../../../../../services/routine.service';
import { ExerciseService } from '../../../../../services/exercise.service';
import { AuthService } from '../../../../../services/auth.service';
import { CoachService } from '../../../../../services/coach.service';
import { MUSCLE_GROUPS } from '../../../../../utils/muscle-groups';
import { Exercise } from '../../../../../models/exercise.model';
import { getDefaultExerciseImage } from '../../../../../utils/exercise-default-images';
import { hasCoachPremiumFeatureAccess } from '../../../../../models/coach.model';
import {
  RoutineExerciseBlockType,
  getRoutineExerciseBlockLabel,
  getRoutineExerciseBlockSize,
  isGroupedRoutineExerciseBlockType
} from '../../../../../models/routine.model';

type ExerciseFilterMode = 'all' | 'global' | 'coach';
type SearchScope = 'selected' | 'all';

@Component({
  selector: 'app-step3-muscle-groups',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="step-container">
      <h2>Planificación de la Rutina</h2>
      <p class="subtitle">Selecciona los grupos musculares y ejercicios para cada día</p>

      <!-- Mobile: Day Progress Indicator -->
      <div class="day-progress-mobile">
        <div class="progress-dots">
          <div 
            *ngFor="let day of days(); let i = index" 
            class="progress-dot"
            [class.active]="i === currentDayIndex()"
            [class.completed]="day.exercises.length > 0"
            (click)="goToDay(i)"
          >
            <span class="dot-number">{{ i + 1 }}</span>
          </div>
        </div>
      </div>

      <!-- Desktop: All days grid -->
      <div class="days-grid days-grid-desktop">
        <div *ngFor="let day of days(); let dayIndex = index" class="day-card">
          <div class="day-header">
            <h3>Día {{ dayIndex + 1 }}</h3>
            <div class="day-header-right">
              <span class="badge" *ngIf="day.exercises.length > 0">
                {{ day.exercises.length }} Ejercicios
              </span>
              <button
                *ngIf="day.exercises.length > 0"
                class="btn-copy-day"
                (click)="openCopyModal(dayIndex)"
                title="Copiar este día a otros días"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copiar día
              </button>
            </div>
          </div>

          <!-- Muscle Groups Selection -->
          <div class="section-title">Grupos Musculares</div>
          <div class="muscle-groups">
            <div 
              *ngFor="let group of muscleGroups" 
              class="muscle-chip"
              [class.selected]="day.muscleGroups.includes(group)"
              [class.disabled]="day.muscleGroups.includes(group)"
              (click)="toggleMuscleGroup(dayIndex, group)"
              [title]="day.muscleGroups.includes(group) ? 'Ya seleccionado - click para remover' : 'Click para agregar'"
            >
              {{ group }}
            </div>
          </div>

          <!-- Selected Exercises List -->
          <div class="selected-exercises-list" *ngIf="day.exercises.length > 0">
            <div class="section-title">Ejercicios Seleccionados</div>
            <div *ngFor="let ex of day.exercises; let exIndex = index" class="selected-exercise-item">
                <div class="selected-exercise-main">
                  <span class="name">{{ ex.exercise.name }}</span>
                  <span *ngIf="isGroupedBlock(ex)" class="biserie-pill">
                    {{ getBlockDisplayLabel(ex) }}
                  </span>
                </div>
                <div class="selected-exercise-actions">
                  <button
                    *ngIf="routinePremiumFeaturesEnabled()"
                    type="button"
                    class="btn-biserie secondary"
                    (click)="openReplaceExercise(dayIndex, exIndex)"
                    title="Reemplazar este ejercicio sin cambiar su posición"
                  >
                    Reemplazar
                  </button>
                  <button
                    *ngIf="canCreateGroupedBlockWithNext(dayIndex, exIndex, 2)"
                    type="button"
                    class="btn-biserie"
                    (click)="createGroupedBlock(dayIndex, exIndex, 'biserie')"
                    title="Crear biserie con este ejercicio y el siguiente"
                  >
                    Biserie
                  </button>
                  <button
                    *ngIf="canCreateGroupedBlockWithNext(dayIndex, exIndex, 3)"
                    type="button"
                    class="btn-biserie"
                    (click)="createGroupedBlock(dayIndex, exIndex, 'triserie')"
                    title="Crear triserie con este ejercicio y los dos siguientes"
                  >
                    Triserie
                  </button>
                  <button
                    *ngIf="routinePremiumFeaturesEnabled() && isGroupedBlock(ex)"
                    type="button"
                    class="btn-biserie secondary"
                    (click)="removeBlock(dayIndex, ex.blockId)"
                    title="Quitar este bloque"
                  >
                    Quitar
                  </button>
                  <button class="btn-remove" (click)="removeExercise(dayIndex, exIndex)">×</button>
                </div>
            </div>
          </div>

          <!-- Available Exercises Selection -->
          <div class="available-exercises-section">
            <div class="section-title">Agregar Ejercicios</div>
            <div class="exercise-source-filter">
              <button
                type="button"
                class="filter-chip"
                [class.active]="exerciseFilterMode() === 'all'"
                (click)="setExerciseFilterMode('all')"
              >
                Todos
              </button>
              <button
                type="button"
                class="filter-chip"
                [class.active]="exerciseFilterMode() === 'global'"
                (click)="setExerciseFilterMode('global')"
              >
                Globales
              </button>
              <button
                type="button"
                class="filter-chip"
                [class.active]="exerciseFilterMode() === 'coach'"
                (click)="setExerciseFilterMode('coach')"
              >
                Propios
              </button>
            </div>

            <div class="global-search-box">
              <input
                type="text"
                placeholder="Buscar en todos los ejercicios y grupos musculares..."
                [value]="daySearchTerms().get(dayIndex) || ''"
                (input)="updateDaySearchTerm(dayIndex, $any($event.target).value)"
              />
              <p class="global-search-hint">
                Busca por nombre y agrégalo directo al día. Si su grupo muscular no está seleccionado, se asigna automáticamente.
              </p>
            </div>

            <div class="search-results-panel" *ngIf="(daySearchTerms().get(dayIndex) || '').trim() as searchTerm">
              <div class="search-results-header">
                <span>Resultados en todos los grupos</span>
                <span class="search-results-count">{{ getDaySearchResults(dayIndex).length }}</span>
              </div>

              <div class="exercises-scroll-grid search-results-grid" *ngIf="getDaySearchResults(dayIndex).length > 0; else emptyDaySearchResults">
                <div
                  *ngFor="let exercise of getDaySearchResults(dayIndex)"
                  class="exercise-mini-card"
                  [class.added]="isExerciseInDay(dayIndex, exercise.id!)"
                  (mousedown)="toggleExerciseFromGlobalSearch(dayIndex, exercise, $event)"
                >
                  <div class="mini-image">
                    <img
                      [src]="getExerciseImage(exercise)"
                      [alt]="exercise.name"
                      (error)="onImageError($event, exercise)"
                    >
                  </div>
                  <div class="mini-content">
                    <span class="mini-name">{{ exercise.name }}</span>
                    <span class="mini-group">{{ exercise.muscleGroup }}</span>
                  </div>
                  <div class="check-indicator" *ngIf="isExerciseInDay(dayIndex, exercise.id!)">✓</div>
                </div>
              </div>

              <ng-template #emptyDaySearchResults>
                <div class="empty-exercises empty-search-results">
                  No se encontraron ejercicios para "{{ searchTerm }}".
                </div>
              </ng-template>
            </div>
            
            <!-- Single muscle group: simple view -->
            <div *ngIf="!hasManualMuscleGroups(dayIndex)" class="empty-exercises empty-groups-state">
              Selecciona grupos musculares o usa el buscador para agregar ejercicios directamente a este día.
            </div>

            <div *ngIf="hasManualMuscleGroups(dayIndex) && day.muscleGroups.length === 1" class="exercises-scroll-grid">
                <div 
                    *ngFor="let exercise of getExercisesForDay(day.muscleGroups, 'selected')" 
                    class="exercise-mini-card"
                    [class.added]="isExerciseInDay(dayIndex, exercise.id!)"
                    (mousedown)="toggleExerciseInDay(dayIndex, exercise, $event)"
                >
                    <div class="mini-image">
                        <img 
                            [src]="getExerciseImage(exercise)" 
                            [alt]="exercise.name"
                            (error)="onImageError($event, exercise)"
                        >
                    </div>
                    <div class="mini-content">
                        <span class="mini-name">{{ exercise.name }}</span>
                        <span class="mini-group">{{ exercise.muscleGroup }}</span>
                    </div>
                    <div class="check-indicator" *ngIf="isExerciseInDay(dayIndex, exercise.id!)">✓</div>
                </div>
                <div *ngIf="getExercisesForDay(day.muscleGroups, 'selected').length === 0" class="empty-exercises">
                    No hay ejercicios disponibles para los grupos seleccionados.
                </div>
            </div>

            <!-- Multiple muscle groups: accordion view -->
            <div *ngIf="hasManualMuscleGroups(dayIndex) && day.muscleGroups.length > 1" class="muscle-group-accordions">
              <div *ngFor="let group of day.muscleGroups" class="accordion-item">
                <div class="accordion-header" (click)="toggleGroupAccordion(group)">
                  <div class="header-left">
                    <span class="group-name">{{ group }}</span>
                    <span class="exercise-count">({{ getExercisesForGroup(group).length }} ejercicios)</span>
                  </div>
                  <span class="toggle-icon" [class.expanded]="expandedGroups().has(group)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="m9 6 6 6-6 6"></path>
                    </svg>
                  </span>
                </div>
                
                <div class="accordion-content" *ngIf="expandedGroups().has(group)">
                  <div class="search-box">
                    <input 
                      type="text"
                      placeholder="Buscar ejercicio..."
                      [value]="searchTerms().get(group) || ''"
                      (input)="updateSearchTerm(group, $any($event.target).value)"
                    />
                  </div>
                  
                  <div class="exercises-scroll-grid">
                    <div *ngFor="let exercise of getFilteredExercisesForGroup(group, dayIndex)"
                         class="exercise-mini-card"
                         [class.added]="isExerciseInDay(dayIndex, exercise.id!)"
                         (mousedown)="toggleExerciseInDay(dayIndex, exercise, $event)">
                      <div class="mini-image">
                          <img 
                              [src]="getExerciseImage(exercise)" 
                              [alt]="exercise.name"
                              (error)="onImageError($event, exercise)"
                          >
                      </div>
                      <div class="mini-content">
                          <span class="mini-name">{{ exercise.name }}</span>
                          <span class="mini-group">{{ exercise.muscleGroup }}</span>
                      </div>
                      <div class="check-indicator" *ngIf="isExerciseInDay(dayIndex, exercise.id!)">✓</div>
                    </div>
                    <div *ngIf="getFilteredExercisesForGroup(group, dayIndex).length === 0" class="empty-exercises">
                        {{ searchTerms().get(group) ? 'No se encontraron ejercicios' : 'No hay ejercicios disponibles' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Copy Day Modal -->
      <div class="modal-overlay" *ngIf="copyingFromDayIndex() !== null" (click)="closeCopyModal()">
        <div class="modal-content copy-day-modal" (click)="$event.stopPropagation()">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copiar Día {{ (copyingFromDayIndex() ?? 0) + 1 }} a…
          </h3>
          <p class="copy-modal-subtitle">Selecciona los días destino. Su contenido será reemplazado.</p>
          <div class="copy-day-list">
            <div
              *ngFor="let day of days(); let i = index"
              class="copy-day-item"
              [class.source]="i === copyingFromDayIndex()"
              [class.has-exercises]="day.exercises.length > 0 && i !== copyingFromDayIndex()"
            >
              <label class="copy-day-label">
                <input
                  type="checkbox"
                  [disabled]="i === copyingFromDayIndex()"
                  [checked]="selectedTargetDays().has(i)"
                  (change)="toggleTargetDay(i)"
                />
                <span class="copy-day-name">Día {{ i + 1 }}</span>
                <span class="copy-day-muscles" *ngIf="day.muscleGroups.length > 0">
                  {{ day.muscleGroups.join(', ') }}
                </span>
                <span class="copy-day-badge source-badge" *ngIf="i === copyingFromDayIndex()">Origen</span>
                <span class="copy-day-badge replace-badge" *ngIf="day.exercises.length > 0 && i !== copyingFromDayIndex() && selectedTargetDays().has(i)">Se reemplazará</span>
              </label>
            </div>
          </div>
          <div class="copy-modal-actions">
            <button class="btn-cancel" (click)="closeCopyModal()">Cancelar</button>
            <button
              class="btn-save"
              [disabled]="selectedTargetDays().size === 0"
              (click)="confirmCopy()"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copiar ({{ selectedTargetDays().size }})
            </button>
          </div>
        </div>
      </div>

      <!-- Mobile: Single day view -->
      <div class="days-grid days-grid-mobile">
        <div *ngIf="days()[currentDayIndex()] as day" class="day-card">
          <div class="day-header">
            <h3>Día {{ currentDayIndex() + 1 }} de {{ days().length }}</h3>
            <div class="day-header-right">
              <span class="badge" *ngIf="day.exercises.length > 0">
                {{ day.exercises.length }} Ejercicios
              </span>
              <button
                *ngIf="day.exercises.length > 0"
                class="btn-copy-day"
                (click)="openCopyModal(currentDayIndex())"
                title="Copiar este día a otros días"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copiar
              </button>
            </div>
          </div>

          <!-- Muscle Groups Selection -->
          <div class="section-title">Grupos Musculares</div>
          <div class="muscle-groups">
            <div 
              *ngFor="let group of muscleGroups" 
              class="muscle-chip"
              [class.selected]="day.muscleGroups.includes(group)"
              [class.disabled]="day.muscleGroups.includes(group)"
              (click)="toggleMuscleGroup(currentDayIndex(), group)"
              [title]="day.muscleGroups.includes(group) ? 'Ya seleccionado - click para remover' : 'Click para agregar'"
            >
              {{ group }}
            </div>
          </div>

          <!-- Selected Exercises List -->
          <div class="selected-exercises-list" *ngIf="day.exercises.length > 0">
            <div class="section-title">Ejercicios Seleccionados</div>
            <div *ngFor="let ex of day.exercises; let exIndex = index" class="selected-exercise-item">
                <div class="selected-exercise-main">
                  <span class="name">{{ ex.exercise.name }}</span>
                  <span *ngIf="isGroupedBlock(ex)" class="biserie-pill">
                    {{ getBlockDisplayLabel(ex) }}
                  </span>
                </div>
                <div class="selected-exercise-actions">
                  <button
                    *ngIf="routinePremiumFeaturesEnabled()"
                    type="button"
                    class="btn-biserie secondary"
                    (click)="openReplaceExercise(currentDayIndex(), exIndex)"
                    title="Reemplazar este ejercicio sin cambiar su posición"
                  >
                    Reemplazar
                  </button>
                  <button
                    *ngIf="canCreateGroupedBlockWithNext(currentDayIndex(), exIndex, 2)"
                    type="button"
                    class="btn-biserie"
                    (click)="createGroupedBlock(currentDayIndex(), exIndex, 'biserie')"
                    title="Crear biserie con este ejercicio y el siguiente"
                  >
                    Biserie
                  </button>
                  <button
                    *ngIf="canCreateGroupedBlockWithNext(currentDayIndex(), exIndex, 3)"
                    type="button"
                    class="btn-biserie"
                    (click)="createGroupedBlock(currentDayIndex(), exIndex, 'triserie')"
                    title="Crear triserie con este ejercicio y los dos siguientes"
                  >
                    Triserie
                  </button>
                  <button
                    *ngIf="routinePremiumFeaturesEnabled() && isGroupedBlock(ex)"
                    type="button"
                    class="btn-biserie secondary"
                    (click)="removeBlock(currentDayIndex(), ex.blockId)"
                    title="Quitar este bloque"
                  >
                    Quitar
                  </button>
                  <button class="btn-remove" (click)="removeExercise(currentDayIndex(), exIndex)">×</button>
                </div>
            </div>
          </div>

          <!-- Available Exercises Selection -->
          <div class="available-exercises-section">
            <div class="section-title">Agregar Ejercicios</div>
            <div class="exercise-source-filter">
              <button
                type="button"
                class="filter-chip"
                [class.active]="exerciseFilterMode() === 'all'"
                (click)="setExerciseFilterMode('all')"
              >
                Todos
              </button>
              <button
                type="button"
                class="filter-chip"
                [class.active]="exerciseFilterMode() === 'global'"
                (click)="setExerciseFilterMode('global')"
              >
                Globales
              </button>
              <button
                type="button"
                class="filter-chip"
                [class.active]="exerciseFilterMode() === 'coach'"
                (click)="setExerciseFilterMode('coach')"
              >
                Propios
              </button>
            </div>

            <div class="global-search-box">
              <input
                type="text"
                placeholder="Buscar en todos los ejercicios y grupos musculares..."
                [value]="daySearchTerms().get(currentDayIndex()) || ''"
                (input)="updateDaySearchTerm(currentDayIndex(), $any($event.target).value)"
              />
              <p class="global-search-hint">
                Busca por nombre y agrégalo directo al día. Si su grupo muscular no está seleccionado, se asigna automáticamente.
              </p>
            </div>

            <div class="search-results-panel" *ngIf="(daySearchTerms().get(currentDayIndex()) || '').trim() as searchTerm">
              <div class="search-results-header">
                <span>Resultados en todos los grupos</span>
                <span class="search-results-count">{{ getDaySearchResults(currentDayIndex()).length }}</span>
              </div>

              <div class="exercises-scroll-grid search-results-grid" *ngIf="getDaySearchResults(currentDayIndex()).length > 0; else emptyCurrentDaySearchResults">
                <div
                  *ngFor="let exercise of getDaySearchResults(currentDayIndex())"
                  class="exercise-mini-card"
                  [class.added]="isExerciseInDay(currentDayIndex(), exercise.id!)"
                  (mousedown)="toggleExerciseFromGlobalSearch(currentDayIndex(), exercise, $event)"
                >
                  <div class="mini-image">
                    <img
                      [src]="getExerciseImage(exercise)"
                      [alt]="exercise.name"
                      (error)="onImageError($event, exercise)"
                    >
                  </div>
                  <div class="mini-content">
                    <span class="mini-name">{{ exercise.name }}</span>
                    <span class="mini-group">{{ exercise.muscleGroup }}</span>
                  </div>
                  <div class="check-indicator" *ngIf="isExerciseInDay(currentDayIndex(), exercise.id!)">✓</div>
                </div>
              </div>

              <ng-template #emptyCurrentDaySearchResults>
                <div class="empty-exercises empty-search-results">
                  No se encontraron ejercicios para "{{ searchTerm }}".
                </div>
              </ng-template>
            </div>
            
            <!-- Single muscle group: simple view -->
            <div *ngIf="!hasManualMuscleGroups(currentDayIndex())" class="empty-exercises empty-groups-state">
              Selecciona grupos musculares o usa el buscador para agregar ejercicios directamente a este día.
            </div>

            <div *ngIf="hasManualMuscleGroups(currentDayIndex()) && day.muscleGroups.length === 1" class="exercises-scroll-grid">
                <div 
                    *ngFor="let exercise of getExercisesForDay(day.muscleGroups, 'selected')" 
                    class="exercise-mini-card"
                    [class.added]="isExerciseInDay(currentDayIndex(), exercise.id!)"
                    (mousedown)="toggleExerciseInDay(currentDayIndex(), exercise, $event)"
                >
                    <div class="mini-image">
                        <img 
                            [src]="getExerciseImage(exercise)" 
                            [alt]="exercise.name"
                            (error)="onImageError($event, exercise)"
                        >
                    </div>
                    <div class="mini-content">
                        <span class="mini-name">{{ exercise.name }}</span>
                        <span class="mini-group">{{ exercise.muscleGroup }}</span>
                    </div>
                    <div class="check-indicator" *ngIf="isExerciseInDay(currentDayIndex(), exercise.id!)">✓</div>
                </div>
                <div *ngIf="getExercisesForDay(day.muscleGroups, 'selected').length === 0" class="empty-exercises">
                    No hay ejercicios disponibles para los grupos seleccionados.
                </div>
            </div>

            <!-- Multiple muscle groups: accordion view -->
            <div *ngIf="hasManualMuscleGroups(currentDayIndex()) && day.muscleGroups.length > 1" class="muscle-group-accordions">
              <div *ngFor="let group of day.muscleGroups" class="accordion-item">
                <div class="accordion-header" (click)="toggleGroupAccordion(group)">
                  <div class="header-left">
                    <span class="group-name">{{ group }}</span>
                    <span class="exercise-count">({{ getExercisesForGroup(group).length }})</span>
                  </div>
                  <span class="toggle-icon" [class.expanded]="expandedGroups().has(group)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="m9 6 6 6-6 6"></path>
                    </svg>
                  </span>
                </div>
                
                <div class="accordion-content" *ngIf="expandedGroups().has(group)">
                  <div class="search-box">
                    <input 
                      type="text"
                      placeholder="Buscar ejercicio..."
                      [value]="searchTerms().get(group) || ''"
                      (input)="updateSearchTerm(group, $any($event.target).value)"
                    />
                  </div>
                  
                  <div class="exercises-scroll-grid">
                    <div *ngFor="let exercise of getFilteredExercisesForGroup(group, currentDayIndex())"
                         class="exercise-mini-card"
                         [class.added]="isExerciseInDay(currentDayIndex(), exercise.id!)"
                         (mousedown)="toggleExerciseInDay(currentDayIndex(), exercise, $event)">
                      <div class="mini-image">
                          <img 
                              [src]="getExerciseImage(exercise)" 
                              [alt]="exercise.name"
                              (error)="onImageError($event, exercise)"
                          >
                      </div>
                      <div class="mini-content">
                          <span class="mini-name">{{ exercise.name }}</span>
                          <span class="mini-group">{{ exercise.muscleGroup }}</span>
                      </div>
                      <div class="check-indicator" *ngIf="isExerciseInDay(currentDayIndex(), exercise.id!)">✓</div>
                    </div>
                    <div *ngIf="getFilteredExercisesForGroup(group, currentDayIndex()).length === 0" class="empty-exercises">
                        {{ searchTerms().get(group) ? 'No se encontraron ejercicios' : 'No hay ejercicios disponibles' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Replace Exercise Modal -->
      <div class="modal-overlay" *ngIf="replacementTarget()" (click)="closeReplaceExercise()">
        <div class="modal-content replace-exercise-modal" (click)="$event.stopPropagation()">
          <h3>Reemplazar ejercicio</h3>
          <div class="global-search-box">
            <input
              type="text"
              placeholder="Buscar ejercicio..."
              [value]="replacementSearchTerm()"
              (input)="replacementSearchTerm.set($any($event.target).value)"
              autofocus
            />
          </div>
          <div class="exercises-scroll-grid replacement-results">
            <div
              *ngFor="let exercise of getReplacementSearchResults()"
              class="exercise-mini-card"
              (mousedown)="replaceExercise(exercise, $event)"
            >
              <div class="mini-image">
                <img
                  [src]="getExerciseImage(exercise)"
                  [alt]="exercise.name"
                  (error)="onImageError($event, exercise)"
                >
              </div>
              <div class="mini-content">
                <span class="mini-name">{{ exercise.name }}</span>
                <span class="mini-group">{{ exercise.muscleGroup }}</span>
              </div>
            </div>
            <div *ngIf="getReplacementSearchResults().length === 0" class="empty-exercises">
              No se encontraron ejercicios
            </div>
          </div>
          <div class="copy-modal-actions">
            <button class="btn-cancel" (click)="closeReplaceExercise()">Cancelar</button>
          </div>
        </div>
      </div>

      <!-- Mobile: Navigation Buttons -->
      <div class="day-navigation-mobile">
        <button 
          class="nav-btn prev-btn" 
          [disabled]="currentDayIndex() === 0"
          (click)="prevDay()"
        >
          <span class="arrow">←</span>
          <span class="text">Anterior</span>
        </button>
        
        <button 
          class="nav-btn next-btn" 
          [disabled]="currentDayIndex() === days().length - 1"
          (click)="nextDay()"
        >
          <span class="text">Siguiente</span>
          <span class="arrow">→</span>
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./step3-muscle-groups.component.scss']
})
export class Step3MuscleGroupsComponent implements OnInit {
  private routineService = inject(RoutineService);
  private exerciseService = inject(ExerciseService);
  private authService = inject(AuthService);
  private coachService = inject(CoachService);
  private route = inject(ActivatedRoute);

  muscleGroups = MUSCLE_GROUPS;
  days = computed(() => this.routineService.wizardState().days);

  // Local state for exercises
  allExercises = signal<Exercise[]>([]);

  // Copy-day modal state
  copyingFromDayIndex = signal<number | null>(null);
  selectedTargetDays = signal<Set<number>>(new Set());

  // Mobile navigation: current day being edited
  currentDayIndex = signal(0);

  // Accordion state: which muscle groups are expanded
  expandedGroups = signal<Set<string>>(new Set());

  // Search terms for each muscle group
  searchTerms = signal<Map<string, string>>(new Map());
  daySearchTerms = signal<Map<number, string>>(new Map());
  manualMuscleGroupSelections = signal<Map<number, Set<string>>>(new Map());
  exerciseFilterMode = signal<ExerciseFilterMode>('all');
  routinePremiumFeaturesEnabled = signal(false);
  replacementTarget = signal<{ dayIndex: number; exerciseIndex: number } | null>(null);
  replacementSearchTerm = signal('');

  // Computed: check if current day is complete (has at least one exercise)
  isCurrentDayComplete = computed(() => {
    const day = this.days()[this.currentDayIndex()];
    return day && day.exercises.length > 0;
  });

  ngOnInit() {
    this.initializeManualMuscleGroups();
    this.loadExercises();
    this.loadRoutinePremiumFeatureAccess();
  }

  // Navigate to next day
  nextDay() {
    const totalDays = this.days().length;
    if (this.currentDayIndex() < totalDays - 1) {
      this.currentDayIndex.set(this.currentDayIndex() + 1);
    }
  }

  // Navigate to previous day
  prevDay() {
    if (this.currentDayIndex() > 0) {
      this.currentDayIndex.set(this.currentDayIndex() - 1);
    }
  }

  // Jump to specific day
  goToDay(index: number) {
    if (index >= 0 && index < this.days().length) {
      this.currentDayIndex.set(index);
    }
  }

  async loadExercises() {
    const userId = this.authService.getCurrentUserId();
    const [global, coach] = await Promise.all([
      this.exerciseService.getGlobalExercises(),
      userId ? this.exerciseService.getCoachExercises(userId) : Promise.resolve([])
    ]);
    this.allExercises.set([...global, ...coach]);
  }

  async loadRoutinePremiumFeatureAccess() {
    const targetCoachId = this.route.snapshot.paramMap.get('coachId') || this.authService.getCurrentUserId();
    if (!targetCoachId) {
      this.routinePremiumFeaturesEnabled.set(false);
      return;
    }

    const coach = await this.coachService.getCoachProfile(targetCoachId);
    this.routinePremiumFeaturesEnabled.set(hasCoachPremiumFeatureAccess(coach));
  }

  getExerciseImage(exercise: Exercise): string {
    if (exercise.isGlobal) {
      return getDefaultExerciseImage(exercise.muscleGroup);
    }
    return exercise.imageUrl?.trim() || getDefaultExerciseImage(exercise.muscleGroup);
  }

  onImageError(event: Event, exercise: Exercise): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;
    if (img.src.startsWith('data:image/svg+xml')) return;
    img.src = getDefaultExerciseImage(exercise.muscleGroup || 'Full Body');
  }

  toggleMuscleGroup(dayIndex: number, group: string) {
    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[dayIndex] };
    const groups = [...day.muscleGroups];
    const manualSelections = new Map(this.manualMuscleGroupSelections());
    const dayManualSelections = new Set(manualSelections.get(dayIndex) ?? []);

    if (groups.includes(group)) {
      day.muscleGroups = groups.filter(g => g !== group);
      dayManualSelections.delete(group);
    } else {
      day.muscleGroups = [...groups, group];
      dayManualSelections.add(group);
    }

    currentDays[dayIndex] = day;
    manualSelections.set(dayIndex, dayManualSelections);
    this.manualMuscleGroupSelections.set(manualSelections);
    this.routineService.updateWizardState({ days: currentDays });

    // Initialize expanded groups when muscle groups change
    if (day.muscleGroups.length > 1) {
      this.initializeExpandedGroups(day.muscleGroups);
    }
  }

  getExercisesForDay(muscleGroups: string[], scope: SearchScope = 'selected'): Exercise[] {
    const filteredExercises = this.getExercisesByScope(muscleGroups, scope);

    // Sort exercises by the order of muscle groups selected
    return filteredExercises.sort((a, b) => {
      const indexA = muscleGroups.indexOf(a.muscleGroup);
      const indexB = muscleGroups.indexOf(b.muscleGroup);
      return indexA - indexB;
    });
  }

  // Toggle accordion for a muscle group
  toggleGroupAccordion(group: string) {
    const expanded = new Set(this.expandedGroups());
    if (expanded.has(group)) {
      expanded.delete(group);
    } else {
      expanded.add(group);
    }
    this.expandedGroups.set(expanded);
  }

  // Update search term for a muscle group
  updateSearchTerm(group: string, term: string) {
    const terms = new Map(this.searchTerms());
    terms.set(group, this.normalizeSearchTerm(term));
    this.searchTerms.set(terms);
  }

  updateDaySearchTerm(dayIndex: number, term: string) {
    const terms = new Map(this.daySearchTerms());
    const normalizedTerm = this.normalizeSearchTerm(term);

    if (!normalizedTerm) {
      terms.delete(dayIndex);
    } else {
      terms.set(dayIndex, normalizedTerm);
    }

    this.daySearchTerms.set(terms);
  }

  hasManualMuscleGroups(dayIndex: number): boolean {
    return (this.manualMuscleGroupSelections().get(dayIndex)?.size ?? 0) > 0;
  }

  // Get exercises for a specific muscle group
  getExercisesForGroup(group: string): Exercise[] {
    return this.allExercises().filter(ex => ex.muscleGroup === group && this.matchesExerciseFilter(ex));
  }

  // Get filtered exercises for a muscle group based on search term
  getFilteredExercisesForGroup(group: string, dayIndex: number): Exercise[] {
    const exercises = this.getExercisesForGroup(group);
    const searchTerm = this.searchTerms().get(group) || '';

    if (!searchTerm) {
      return exercises;
    }

    return exercises.filter(ex =>
      this.exerciseMatchesSearch(ex, searchTerm)
    );
  }

  getDaySearchResults(dayIndex: number): Exercise[] {
    const searchTerm = this.daySearchTerms().get(dayIndex) || '';

    if (!searchTerm) {
      return [];
    }

    const selectedGroups = this.days()[dayIndex]?.muscleGroups ?? [];
    const selectedGroupResults = this.getExercisesByScope(selectedGroups, 'selected')
      .filter(ex => this.exerciseMatchesSearch(ex, searchTerm));

    const selectedResultIds = new Set(selectedGroupResults.map(ex => ex.id));
    const allOtherResults = this.getExercisesByScope([], 'all')
      .filter(ex => !selectedResultIds.has(ex.id))
      .filter(ex => this.exerciseMatchesSearch(ex, searchTerm))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return [...selectedGroupResults, ...allOtherResults];
  }

  // Initialize expanded groups when muscle groups change
  initializeExpandedGroups(muscleGroups: string[]) {
    if (muscleGroups.length > 0) {
      const expanded = new Set<string>();
      expanded.add(muscleGroups[0]); // Expand first group by default
      this.expandedGroups.set(expanded);
    }
  }

  setExerciseFilterMode(mode: ExerciseFilterMode) {
    this.exerciseFilterMode.set(mode);
  }

  private matchesExerciseFilter(exercise: Exercise): boolean {
    const mode = this.exerciseFilterMode();
    if (mode === 'global') return exercise.isGlobal;
    if (mode === 'coach') return !exercise.isGlobal;
    return true;
  }

  isExerciseInDay(dayIndex: number, exerciseId: string): boolean {
    const day = this.days()[dayIndex];
    return day.exercises.some(e => e.exercise.id === exerciseId);
  }

  getBiserieLabel(exercise: any): string {
    const label = exercise?.blockLabel || '';
    const position = exercise?.blockPosition || '';
    return `${label}${position ? position : ''}`.trim();
  }

  isGroupedBlock(exercise: any): boolean {
    return isGroupedRoutineExerciseBlockType(exercise?.blockType);
  }

  getBlockDisplayLabel(exercise: any): string {
    const blockLabel = getRoutineExerciseBlockLabel(exercise?.blockType);
    const positionLabel = this.getBiserieLabel(exercise);
    return `${blockLabel}${positionLabel ? ` ${positionLabel}` : ''}`.trim();
  }

  canCreateGroupedBlockWithNext(dayIndex: number, exerciseIndex: number, blockSize: 2 | 3): boolean {
    if (!this.routinePremiumFeaturesEnabled()) return false;
    const day = this.days()[dayIndex];
    if (!day) return false;
    const blockExercises = day.exercises.slice(exerciseIndex, exerciseIndex + blockSize);
    return blockExercises.length === blockSize && blockExercises.every(exercise => !this.isGroupedBlock(exercise));
  }

  canCreateBiserieWithNext(dayIndex: number, exerciseIndex: number): boolean {
    return this.canCreateGroupedBlockWithNext(dayIndex, exerciseIndex, 2);
  }

  createGroupedBlock(dayIndex: number, exerciseIndex: number, blockType: Exclude<RoutineExerciseBlockType, 'single'>): void {
    const state = this.routineService.wizardState();
    const day = state.days[dayIndex];
    const blockSize = getRoutineExerciseBlockSize(blockType) as 2 | 3;
    if (!day || !this.canCreateGroupedBlockWithNext(dayIndex, exerciseIndex, blockSize)) return;

    const blockId = this.createBlockId();
    const blockLabel = this.nextBlockLabel(day.exercises);

    const days = state.days.map((currentDay, currentDayIndex) => {
      if (currentDayIndex !== dayIndex) return currentDay;

      const exercises = currentDay.exercises.map((exercise, currentExerciseIndex) => {
        if (currentExerciseIndex >= exerciseIndex && currentExerciseIndex < exerciseIndex + blockSize) {
          return {
            ...exercise,
            isSuperset: true,
            blockType,
            blockId,
            blockLabel,
            blockPosition: currentExerciseIndex - exerciseIndex + 1,
            blockRest: currentDay.exercises[exerciseIndex + blockSize - 1]?.rest || exercise.rest || '60s'
          };
        }
        return exercise;
      });

      return { ...currentDay, exercises: this.normalizeExerciseOrderAndBlocks(exercises) };
    });

    this.routineService.updateWizardState({ days });
  }

  createBiserieWithNext(dayIndex: number, exerciseIndex: number): void {
    this.createGroupedBlock(dayIndex, exerciseIndex, 'biserie');
  }

  removeBlock(dayIndex: number, blockId: string | null | undefined): void {
    if (!blockId) return;

    const days = this.routineService.wizardState().days.map((day, currentDayIndex) => {
      if (currentDayIndex !== dayIndex) return day;

      const exercises = day.exercises.map(exercise => {
        if (exercise.blockId !== blockId) return exercise;
        return this.clearBiserieFields(exercise);
      });

      return { ...day, exercises: this.normalizeExerciseOrderAndBlocks(exercises) };
    });

    this.routineService.updateWizardState({ days });
  }

  removeBiserie(dayIndex: number, blockId: string | null | undefined): void {
    this.removeBlock(dayIndex, blockId);
  }

  private createBlockId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, char =>
      (Number(char) ^ Math.floor(Math.random() * 16) >> Number(char) / 4).toString(16)
    );
  }

  private nextBlockLabel(exercises: any[]): string {
    const used = new Set(
      exercises
        .filter(exercise => isGroupedRoutineExerciseBlockType(exercise.blockType) && exercise.blockLabel)
        .map(exercise => String(exercise.blockLabel).toUpperCase())
    );

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const letter of alphabet) {
      if (!used.has(letter)) return letter;
    }
    return String(used.size + 1);
  }

  private clearBiserieFields<T extends Record<string, any>>(exercise: T): T {
    return {
      ...exercise,
      isSuperset: false,
      blockType: 'single',
      blockId: null,
      blockLabel: null,
      blockPosition: null,
      blockRest: null
    };
  }

  private normalizeExerciseOrderAndBlocks(exercises: any[]): any[] {
    const groups = new Map<string, any[]>();
    for (const exercise of exercises) {
      if (isGroupedRoutineExerciseBlockType(exercise.blockType) && exercise.blockId) {
        const list = groups.get(exercise.blockId) || [];
        list.push(exercise);
        groups.set(exercise.blockId, list);
      }
    }

    return exercises.map((exercise, index) => {
      const group = exercise.blockId ? groups.get(exercise.blockId) : null;
      const expectedSize = getRoutineExerciseBlockSize(exercise.blockType);
      if (isGroupedRoutineExerciseBlockType(exercise.blockType) && (!group || group.length !== expectedSize)) {
        return {
          ...this.clearBiserieFields(exercise),
          order: index
        };
      }
      return { ...exercise, order: index };
    });
  }

  toggleExerciseInDay(dayIndex: number, exercise: Exercise, event?: MouseEvent) {
    // Prevent default behavior and stop propagation to avoid scroll
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[dayIndex] };
    const currentExercises = [...day.exercises];

    const existingIndex = currentExercises.findIndex(e => e.exercise.id === exercise.id);

    if (existingIndex !== -1) {
      // Remove
      currentExercises.splice(existingIndex, 1);
    } else {
      // Add
      currentExercises.push({
        exercise: exercise,
        sets: 3, // Default
        reps: '10-12', // Default
	        rest: '60s', // Default
	        isSuperset: false,
	        blockType: 'single',
	        blockId: null,
	        blockLabel: null,
	        blockPosition: null,
	        blockRest: null,
	        order: currentExercises.length
	      });
    }

    day.exercises = this.normalizeExerciseOrderAndBlocks(currentExercises);
    currentDays[dayIndex] = day;

    // Update state
    // We also need to update selectedExercises list for compatibility with other steps if needed, 
    // but in this new flow, days.exercises is the source of truth.
    // However, the routine service might rely on selectedExercises for some logic.
    // Let's update selectedExercises as a flat list of all exercises used.

    const allSelected = new Set<string>();
    currentDays.forEach(d => d.exercises.forEach(e => allSelected.add(e.exercise.id!)));

    // We need the full exercise objects for selectedExercises
    const newSelectedExercises = this.allExercises().filter(e => allSelected.has(e.id!));

    this.routineService.updateWizardState({
      days: currentDays,
      selectedExercises: newSelectedExercises
    });
  }

  openReplaceExercise(dayIndex: number, exerciseIndex: number) {
    if (!this.routinePremiumFeaturesEnabled()) return;
    this.replacementTarget.set({ dayIndex, exerciseIndex });
    this.replacementSearchTerm.set('');
  }

  closeReplaceExercise() {
    this.replacementTarget.set(null);
    this.replacementSearchTerm.set('');
  }

  getReplacementSearchResults(): Exercise[] {
    const term = this.replacementSearchTerm().trim().toLowerCase();
    return this.allExercises()
      .filter(exercise => !term || exercise.name.toLowerCase().includes(term) || exercise.muscleGroup.toLowerCase().includes(term))
      .slice(0, 60);
  }

  replaceExercise(exercise: Exercise, event?: MouseEvent) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const target = this.replacementTarget();
    if (!target || !this.routinePremiumFeaturesEnabled()) return;

    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[target.dayIndex] };
    const currentExercises = [...(day.exercises || [])];
    const existing = currentExercises[target.exerciseIndex];

    if (!existing) return;

    currentExercises[target.exerciseIndex] = {
      ...existing,
      exercise
    };

    day.exercises = this.normalizeExerciseOrderAndBlocks(currentExercises);
    if (exercise.muscleGroup && !day.muscleGroups.includes(exercise.muscleGroup)) {
      day.muscleGroups = [...day.muscleGroups, exercise.muscleGroup];
    }
    currentDays[target.dayIndex] = day;

    const allSelected = new Set<string>();
    currentDays.forEach(d => d.exercises.forEach(e => allSelected.add(e.exercise.id!)));
    const newSelectedExercises = this.allExercises().filter(e => allSelected.has(e.id!));

    this.routineService.updateWizardState({
      days: currentDays,
      selectedExercises: newSelectedExercises
    });
    this.closeReplaceExercise();
  }

  toggleExerciseFromGlobalSearch(dayIndex: number, exercise: Exercise, event?: MouseEvent) {
    this.ensureMuscleGroupInDay(dayIndex, exercise.muscleGroup);
    this.toggleExerciseInDay(dayIndex, exercise, event);
    this.updateDaySearchTerm(dayIndex, '');
  }

  removeExercise(dayIndex: number, exerciseIndex: number) {
    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[dayIndex] };
    const currentExercises = [...day.exercises];

    currentExercises.splice(exerciseIndex, 1);
    day.exercises = this.normalizeExerciseOrderAndBlocks(currentExercises);
    currentDays[dayIndex] = day;

    // Update selectedExercises as well
    const allSelected = new Set<string>();
    currentDays.forEach(d => d.exercises.forEach(e => allSelected.add(e.exercise.id!)));
    const newSelectedExercises = this.allExercises().filter(e => allSelected.has(e.id!));

    this.routineService.updateWizardState({
      days: currentDays,
      selectedExercises: newSelectedExercises
    });
  }

  // --- Copy Day ---

  openCopyModal(dayIndex: number) {
    this.copyingFromDayIndex.set(dayIndex);
    this.selectedTargetDays.set(new Set());
  }

  closeCopyModal() {
    this.copyingFromDayIndex.set(null);
    this.selectedTargetDays.set(new Set());
  }

  toggleTargetDay(dayIndex: number) {
    const current = new Set(this.selectedTargetDays());
    if (current.has(dayIndex)) {
      current.delete(dayIndex);
    } else {
      current.add(dayIndex);
    }
    this.selectedTargetDays.set(current);
  }

  confirmCopy() {
    const sourceIndex = this.copyingFromDayIndex();
    const targets = this.selectedTargetDays();
    if (sourceIndex === null || targets.size === 0) return;

    const state = this.routineService.wizardState();
    const sourceDay = state.days[sourceIndex];
    const updatedDays = [...state.days];

    targets.forEach(targetIndex => {
      updatedDays[targetIndex] = {
        ...updatedDays[targetIndex],
        muscleGroups: [...sourceDay.muscleGroups],
        exercises: this.cloneExercisesForCopiedDay(sourceDay.exercises)
      };
    });

    const manualSelections = new Map(this.manualMuscleGroupSelections());
    const sourceManualSelections = new Set(manualSelections.get(sourceIndex) ?? sourceDay.muscleGroups);
    targets.forEach(targetIndex => {
      manualSelections.set(targetIndex, new Set(sourceManualSelections));
    });
    this.manualMuscleGroupSelections.set(manualSelections);

    // Recalculate selectedExercises
    const allSelected = new Set<string>();
    updatedDays.forEach(d => d.exercises.forEach(e => allSelected.add(e.exercise.id!)));
    const newSelectedExercises = this.allExercises().filter(e => allSelected.has(e.id!));

    this.routineService.updateWizardState({ days: updatedDays, selectedExercises: newSelectedExercises });
    this.closeCopyModal();
  }

  private ensureMuscleGroupInDay(dayIndex: number, group: string) {
    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[dayIndex] };

    if (day.muscleGroups.includes(group)) {
      return;
    }

    day.muscleGroups = [...day.muscleGroups, group];
    currentDays[dayIndex] = day;
    this.routineService.updateWizardState({ days: currentDays });

    if (day.muscleGroups.length > 1) {
      const expanded = new Set(this.expandedGroups());
      expanded.add(group);
      if (day.muscleGroups[0]) {
        expanded.add(day.muscleGroups[0]);
      }
      this.expandedGroups.set(expanded);
    }
  }

  private cloneExercisesForCopiedDay(exercises: any[]): any[] {
    const blockIdMap = new Map<string, string>();
    return JSON.parse(JSON.stringify(exercises)).map((exercise: any) => {
      if (!isGroupedRoutineExerciseBlockType(exercise.blockType) || !exercise.blockId) return exercise;
      if (!blockIdMap.has(exercise.blockId)) {
        blockIdMap.set(exercise.blockId, this.createBlockId());
      }
      return {
        ...exercise,
        blockId: blockIdMap.get(exercise.blockId)
      };
    });
  }

  private initializeManualMuscleGroups() {
    const manualSelections = new Map<number, Set<string>>();

    this.days().forEach((day, index) => {
      manualSelections.set(index, new Set(day.muscleGroups));
    });

    this.manualMuscleGroupSelections.set(manualSelections);
  }

  private getExercisesByScope(muscleGroups: string[], scope: SearchScope): Exercise[] {
    return this.allExercises()
      .filter(ex => scope === 'all' || muscleGroups.includes(ex.muscleGroup))
      .filter(ex => this.matchesExerciseFilter(ex));
  }

  private exerciseMatchesSearch(exercise: Exercise, term: string): boolean {
    const normalizedTerm = this.normalizeSearchTerm(term);
    if (!normalizedTerm) return true;

    const haystack = [
      exercise.name,
      exercise.muscleGroup,
      exercise.description || ''
    ]
      .map(value => this.normalizeSearchTerm(value))
      .join(' ');

    return haystack.includes(normalizedTerm);
  }

  private normalizeSearchTerm(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
