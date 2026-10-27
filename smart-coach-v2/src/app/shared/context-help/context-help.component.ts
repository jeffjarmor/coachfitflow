import { Component, input, signal } from '@angular/core';

export interface ContextHelpStep {
  title: string;
  description: string;
}

@Component({
  selector: 'app-context-help',
  standalone: true,
  templateUrl: './context-help.component.html',
  styleUrl: './context-help.component.scss'
})
export class ContextHelpComponent {
  readonly title = input('Guía rápida');
  readonly steps = input<ContextHelpStep[]>([]);
  readonly open = signal(false);
  readonly index = signal(0);

  start(): void {
    this.index.set(0);
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }

  previous(): void {
    this.index.update((value) => Math.max(0, value - 1));
  }

  next(): void {
    if (this.index() >= this.steps().length - 1) return this.close();
    this.index.update((value) => value + 1);
  }
}
