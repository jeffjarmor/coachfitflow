import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-button',
    standalone: true,
    imports: [CommonModule],
    template: `
    <button
      [class]="buttonClass"
      [type]="type"
      [disabled]="disabled || loading"
      (click)="handleClick($event)"
    >
      <span *ngIf="loading" class="spinner"></span>
      <ng-content></ng-content>
    </button>
  `,
    styleUrls: ['./button.component.scss']
})
export class ButtonComponent {
    @Input() variant: 'primary' | 'secondary' | 'outline' | 'danger' = 'primary';
    @Input() size: 'small' | 'medium' | 'large' = 'medium';
    @Input() type: 'button' | 'submit' | 'reset' = 'button';
    @Input() disabled: boolean = false;
    @Input() loading: boolean = false;
    @Input() fullWidth: boolean = false;

    get buttonClass(): string {
        const classes: string[] = [this.variant];

        if (this.size !== 'medium') {
            classes.push(this.size);
        }

        if (this.fullWidth) {
            classes.push('full-width');
        }

        return classes.join(' ');
    }

    handleClick(event: Event): void {
        if (this.disabled || this.loading) {
            event.preventDefault();
            event.stopPropagation();
        }
    }



}
