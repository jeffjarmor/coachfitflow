import { Injectable, signal } from '@angular/core';

export type ProUpsellFeature = 'pro' | 'portal' | 'rir' | 'blocks';

export interface ProUpsellState {
    isOpen: boolean;
    feature: ProUpsellFeature;
    showInstagram: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ProUpsellService {
    private readonly defaultState: ProUpsellState = {
        isOpen: false,
        feature: 'pro',
        showInstagram: false
    };

    private stateSignal = signal<ProUpsellState>(this.defaultState);
    state = this.stateSignal.asReadonly();

    open(feature: ProUpsellFeature = 'pro', options?: { showInstagram?: boolean }): void {
        this.stateSignal.set({
            isOpen: true,
            feature,
            showInstagram: !!options?.showInstagram
        });
    }

    close(): void {
        this.stateSignal.set(this.defaultState);
    }
}
