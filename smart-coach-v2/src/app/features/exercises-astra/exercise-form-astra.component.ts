import { CustomSelectComponent } from '../../shared/custom-select.component';

import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExerciseFormComponent } from '../exercises/exercise-form.component';
import { referenceImage } from './exercise-media';

@Component({
  selector: 'app-exercise-form-astra',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './exercise-form-astra.component.html',
  styleUrl: './exercise-form-astra.component.scss'
})
export class ExerciseFormAstraComponent extends ExerciseFormComponent {
  get cover(): string { return referenceImage(this.muscleGroup.value); }
}
