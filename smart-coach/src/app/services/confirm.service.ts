import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

@Injectable({
    providedIn: 'root'
})
export class ConfirmService {
    isOpen = signal(false);
    options = signal<ConfirmOptions>({
        title: '',
        message: '',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        type: 'info'
    });

    private resolveCallback: ((value: boolean) => void) | null = null;

    confirm(options: ConfirmOptions): Promise<boolean> {
        this.options.set({
            confirmText: 'Confirmar',
            cancelText: 'Cancelar',
            type: 'info',
            ...options
        });
        this.isOpen.set(true);

        return new Promise((resolve) => {
            this.resolveCallback = resolve;
        });
    }

    handleConfirm() {
        this.isOpen.set(false);
        if (this.resolveCallback) {
            this.resolveCallback(true);
            this.resolveCallback = null;
        }
    }

    handleCancel() {
        this.isOpen.set(false);
        if (this.resolveCallback) {
            this.resolveCallback(false);
            this.resolveCallback = null;
        }
    }
}
