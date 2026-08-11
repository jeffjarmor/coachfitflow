import { CommonModule } from '@angular/common';
import { Component, HostListener, inject } from '@angular/core';
import { ProUpsellFeature, ProUpsellService } from '../../../services/pro-upsell.service';

@Component({
    selector: 'app-pro-upsell-modal',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div
            class="pro-modal-backdrop"
            *ngIf="upsellService.state().isOpen"
            role="presentation"
            (click)="close()"
        >
            <section
                class="pro-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pro-modal-title"
                (click)="$event.stopPropagation()"
            >
                <button class="close-btn" type="button" aria-label="Cerrar" (click)="close()">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                    </svg>
                </button>

                <div class="modal-kicker">Plan Pro</div>
                <h2 id="pro-modal-title">{{ titleForFeature(upsellService.state().feature) }}</h2>
                <p class="lead">
                    Pro desbloquea herramientas para dar seguimiento real al entrenamiento de tus clientes y
                    entregar una experiencia más completa fuera de la sesión.
                </p>

                <div class="benefits-grid">
                    <div class="benefit-item">
                        <span class="benefit-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z" /><path d="m4 7 8 6 8-6" /></svg>
                        </span>
                        <div>
                            <h3>Portal del cliente</h3>
                            <p>Invita clientes para que consulten rutinas, mediciones y acceso desde su propio portal.</p>
                        </div>
                    </div>

                    <div class="benefit-item">
                        <span class="benefit-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M3 21h18" /><path d="M7 17V9" /><path d="M12 17V5" /><path d="M17 17v-6" /></svg>
                        </span>
                        <div>
                            <h3>Seguimiento RIR</h3>
                            <p>El cliente registra reps, carga y RIR para que puedas ajustar con datos reales.</p>
                        </div>
                    </div>

                    <div class="benefit-item">
                        <span class="benefit-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M6 9v6" /><path d="M18 9v6" /><path d="M4 10h4" /><path d="M16 10h4" /><path d="M8 12h8" /></svg>
                        </span>
                        <div>
                            <h3>Biseries y triseries</h3>
                            <p>Crea bloques avanzados de ejercicios dentro de tus rutinas para programaciones más precisas.</p>
                        </div>
                    </div>

                    <div class="benefit-item">
                        <span class="benefit-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-6" /></svg>
                        </span>
                        <div>
                            <h3>Actividad reciente</h3>
                            <p>Consulta desde el dashboard quién registró esfuerzo recientemente y dónde conviene ajustar.</p>
                        </div>
                    </div>
                </div>

                <div class="contact-box">
                    <span>Para activar Pro, contacta a Bonfire:</span>
                    <div class="contact-actions">
                        <a href="mailto:contact@thebonfire.dev">contact&#64;thebonfire.dev</a>
                        <a
                            *ngIf="upsellService.state().showInstagram"
                            href="https://www.instagram.com/jeff.jaram"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Instagram &#64;jeff.jaram
                        </a>
                    </div>
                </div>
            </section>
        </div>
    `,
    styles: [`
        .pro-modal-backdrop {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: grid;
            place-items: center;
            padding: 1rem;
            background: rgba(5, 9, 16, 0.74);
            backdrop-filter: blur(8px);
        }

        .pro-modal {
            position: relative;
            width: min(720px, 100%);
            max-height: min(86vh, 760px);
            overflow: auto;
            border-radius: 8px;
            border: 1px solid rgba(204, 255, 0, 0.26);
            background:
                linear-gradient(180deg, rgba(22, 29, 39, 0.98), rgba(12, 17, 25, 0.98));
            color: #f5f7fb;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.44);
            padding: clamp(1.25rem, 3vw, 2rem);
        }

        .close-btn {
            position: absolute;
            top: 0.85rem;
            right: 0.85rem;
            width: 38px;
            height: 38px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.06);
            color: #f5f7fb;
            cursor: pointer;
            display: grid;
            place-items: center;
        }

        .close-btn svg,
        .benefit-icon svg {
            width: 20px;
            height: 20px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .modal-kicker {
            display: inline-flex;
            min-height: 28px;
            align-items: center;
            padding: 0 0.75rem;
            border: 1px solid rgba(204, 255, 0, 0.34);
            border-radius: 999px;
            color: #ccff00;
            font-size: 0.75rem;
            font-weight: 800;
            text-transform: uppercase;
            margin-bottom: 0.85rem;
        }

        h2 {
            max-width: 16ch;
            margin: 0 2.5rem 0.75rem 0;
            font-size: clamp(1.6rem, 4vw, 2.3rem);
            line-height: 1.05;
            letter-spacing: 0;
        }

        .lead {
            margin: 0 0 1.35rem;
            color: #aeb7c5;
            line-height: 1.6;
            max-width: 62ch;
        }

        .benefits-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.85rem;
            margin-bottom: 1.15rem;
        }

        .benefit-item {
            display: grid;
            grid-template-columns: 42px 1fr;
            gap: 0.75rem;
            align-items: start;
            padding: 0.95rem;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.09);
        }

        .benefit-icon {
            width: 42px;
            height: 42px;
            border-radius: 8px;
            display: grid;
            place-items: center;
            background: rgba(204, 255, 0, 0.12);
            color: #ccff00;
        }

        h3 {
            margin: 0 0 0.3rem;
            font-size: 0.98rem;
            color: #ffffff;
            letter-spacing: 0;
        }

        .benefit-item p {
            margin: 0;
            color: #aeb7c5;
            font-size: 0.88rem;
            line-height: 1.45;
        }

        .contact-box {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            border-radius: 8px;
            border: 1px solid rgba(204, 255, 0, 0.24);
            background: rgba(204, 255, 0, 0.08);
            padding: 0.95rem;
            color: #e9edf5;
        }

        .contact-box span {
            font-weight: 700;
        }

        .contact-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 0.65rem;
        }

        .contact-actions a {
            color: #0b0e14;
            background: #ccff00;
            border-radius: 999px;
            min-height: 36px;
            display: inline-flex;
            align-items: center;
            padding: 0 0.85rem;
            text-decoration: none;
            font-weight: 800;
            font-size: 0.85rem;
        }

        @media (max-width: 680px) {
            .pro-modal {
                max-height: 90vh;
            }

            .benefits-grid {
                grid-template-columns: 1fr;
            }

            .contact-box {
                align-items: stretch;
                flex-direction: column;
            }

            .contact-actions {
                justify-content: stretch;
            }

            .contact-actions a {
                justify-content: center;
            }
        }
    `]
})
export class ProUpsellModalComponent {
    upsellService = inject(ProUpsellService);

    @HostListener('document:keydown.escape')
    close(): void {
        this.upsellService.close();
    }

    titleForFeature(feature: ProUpsellFeature): string {
        const titles: Record<ProUpsellFeature, string> = {
            pro: 'Desbloquea Zummith Pro',
            portal: 'Activa el portal del cliente',
            rir: 'Activa el seguimiento RIR',
            blocks: 'Activa bloques avanzados'
        };

        return titles[feature];
    }
}
