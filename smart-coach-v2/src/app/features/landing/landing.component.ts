
import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, NgZone, signal, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeveloperCreditComponent } from '../../shared/developer-credit/developer-credit.component';
import { ZUMMITH_CONTACT } from '../../core/config/contact';

type Audience = 'trainers' | 'gyms';

interface ProductFeature {
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  imagePosition: string;
}

interface FaqItem {
  question: string;
  answer: string;
  contactSuffix?: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, DeveloperCreditComponent],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent {
  readonly contact = ZUMMITH_CONTACT;
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  @ViewChild('productCarousel') private productCarousel?: ElementRef<HTMLDivElement>;

  readonly mobileProductCarousel = signal(false);
  readonly activeProductIndex = signal(0);
  readonly headerHidden = signal(false);
  readonly mobileMenuOpen = signal(false);

  readonly productFeatures: ProductFeature[] = [
    {
      title: 'Gestión de clientes',
      description: 'Perfiles completos, historial y seguimiento con datos ordenados.',
      imageUrl: '/assets/landing/images/client-management.webp',
      imageAlt: 'Entrenadora acompañando a un cliente durante su sesión',
      imagePosition: 'center 45%'
    },
    {
      title: 'Biblioteca de ejercicios',
      description: 'Un catálogo visual para crear rutinas de forma consistente.',
      imageUrl: '/assets/landing/images/exercise-library.webp',
      imageAlt: 'Entrenamiento con pesas en un gimnasio',
      imagePosition: 'center 42%'
    },
    {
      title: 'Creador de rutinas',
      description: 'Un flujo por pasos para construir planes de entrenamiento precisos.',
      imageUrl: '/assets/landing/images/routine-builder.webp',
      imageAlt: 'Entrenamiento supervisado en un gimnasio',
      imagePosition: '52% center'
    },
    {
      title: 'Mediciones y progreso',
      description: 'Registra métricas corporales y revisa la evolución en el tiempo.',
      imageUrl: '/assets/landing/images/measurements-progress.webp',
      imageAlt: 'Persona realizando un ejercicio de fuerza',
      imagePosition: 'center 42%'
    },
    {
      title: 'Pagos y membresías',
      description: 'Controla vencimientos y estados de pago desde un mismo lugar.',
      imageUrl: '/assets/landing/images/payments-memberships.webp',
      imageAlt: 'Área de entrenamiento de un gimnasio',
      imagePosition: 'center 50%'
    },
    {
      title: 'Roles y administración',
      description: 'Define permisos para dueños, staff y administradores.',
      imageUrl: '/assets/landing/images/roles-administration.webp',
      imageAlt: 'Entrenamiento de fuerza con pesas',
      imagePosition: 'center 38%'
    }
  ];

  readonly faqs: FaqItem[] = [
    {
      question: '¿Para quién está diseñado Zummith?',
      answer: 'Para entrenadores independientes, dueños de gimnasio, equipos de staff y clientes que consultan su información desde el portal.'
    },
    {
      question: '¿Puedo gestionar rutinas y progreso?',
      answer: 'Sí. Puedes crear rutinas, organizar ejercicios y registrar mediciones para revisar la evolución de cada cliente.'
    },
    {
      question: '¿Qué agrega el Plan Pro?',
      answer: 'Incluye portal para clientes, invitaciones por correo, registro e historial de RIR, actividad reciente, biseries y triseries.'
    },
    {
      question: '¿El Plan Gym permite trabajar en equipo?',
      answer: 'Sí. Permite múltiples entrenadores, gestión de personal con roles, cuentas para clientes y control centralizado de pagos.'
    },
    {
      question: '¿Cómo solicito un plan de pago?',
      answer: 'Escríbenos por Instagram a',
      contactSuffix: 'para consultar el Plan Pro o el Plan Gym.'
    }
  ];

  activeAudience: Audience = 'trainers';
  activeFaqIndex: number | null = null;

  constructor() {
    afterNextRender(() => {
      const window = this.document.defaultView;
      if (!window) return;

      const desktop = window.matchMedia('(min-width: 821px)');
      const mobileProductView = window.matchMedia('(max-width: 640px)');
      const updateProductViewport = () => {
        this.zone.run(() => {
          this.mobileProductCarousel.set(mobileProductView.matches);
          this.activeProductIndex.set(0);
        });
        this.productCarousel?.nativeElement.scrollTo({ left: 0, behavior: 'instant' });
      };
      updateProductViewport();
      let lastScrollY = Math.max(0, window.scrollY);
      let frame: number | null = null;
      const setHidden = (hidden: boolean) => {
        if (this.headerHidden() !== hidden) this.zone.run(() => this.headerHidden.set(hidden));
      };
      const updateHeader = () => {
        frame = null;
        const scrollY = Math.max(0, window.scrollY);
        const keyboardFocus = this.document.activeElement?.matches('.site-header :focus-visible');
        if (!desktop.matches || scrollY <= 80 || keyboardFocus) {
          lastScrollY = scrollY;
          setHidden(false);
          return;
        }

        // Accumulate small scroll movements to avoid flickering on trackpads.
        const delta = scrollY - lastScrollY;
        if (Math.abs(delta) < 8) return;
        lastScrollY = scrollY;
        setHidden(delta > 0);
      };
      const onScroll = () => {
        if (frame === null) frame = window.requestAnimationFrame(updateHeader);
      };
      const onViewportChange = () => {
        lastScrollY = Math.max(0, window.scrollY);
        setHidden(false);
        this.zone.run(() => this.closeMobileMenu());
      };
      const onPointerDown = (event: PointerEvent) => {
        if (this.mobileMenuOpen() && !this.document.getElementById('landing-header')?.contains(event.target as Node)) {
          this.zone.run(() => this.closeMobileMenu());
        }
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && this.mobileMenuOpen()) {
          event.preventDefault();
          this.zone.run(() => this.closeMobileMenu(true));
        }
      };

      this.zone.runOutsideAngular(() => {
        window.addEventListener('scroll', onScroll, { passive: true });
        desktop.addEventListener('change', onViewportChange);
        mobileProductView.addEventListener('change', updateProductViewport);
        this.document.addEventListener('pointerdown', onPointerDown);
        this.document.addEventListener('keydown', onKeyDown);
      });
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        desktop.removeEventListener('change', onViewportChange);
        mobileProductView.removeEventListener('change', updateProductViewport);
        this.document.removeEventListener('pointerdown', onPointerDown);
        this.document.removeEventListener('keydown', onKeyDown);
        if (frame !== null) window.cancelAnimationFrame(frame);
      });
    });
  }

  onSectionNavigation(event: MouseEvent): void {
    const window = this.document.defaultView;
    if (!window?.matchMedia('(min-width: 821px)').matches || event.defaultPrevented
      || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;

    const section = this.document.getElementById(link.hash.slice(1));
    const landing = event.currentTarget as HTMLElement;
    if (!section || !landing.contains(section)) return;

    const scrollingUp = section.getBoundingClientRect().top < 0;
    const headerHeight = this.document.getElementById('landing-header')?.offsetHeight || 0;
    landing.style.setProperty('--landing-anchor-offset', `${scrollingUp ? headerHeight : 0}px`);
    this.headerHidden.set(!scrollingUp);
  }

  scrollProductTo(index: number): void {
    if (!this.mobileProductCarousel()) return;
    const list = this.productCarousel?.nativeElement;
    const cards = list?.querySelectorAll<HTMLElement>('.product-card');
    if (!list || !cards?.length) return;
    const target = Math.max(0, Math.min(index, cards.length - 1));
    const reducedMotion = this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({
      left: cards[target].offsetLeft - cards[0].offsetLeft,
      behavior: reducedMotion ? 'instant' : 'smooth'
    });
  }

  onProductScroll(): void {
    if (!this.mobileProductCarousel()) return;
    const list = this.productCarousel?.nativeElement;
    const cards = list?.querySelectorAll<HTMLElement>('.product-card');
    if (!list || !cards || cards.length < 2) return;
    const stride = cards[1].offsetLeft - cards[0].offsetLeft;
    if (stride <= 0) return;
    this.activeProductIndex.set(Math.max(0, Math.min(Math.round(list.scrollLeft / stride), cards.length - 1)));
  }

  onProductKeydown(event: KeyboardEvent): void {
    if (!this.mobileProductCarousel()) return;
    const targets: Record<string, number> = {
      ArrowLeft: this.activeProductIndex() - 1,
      ArrowRight: this.activeProductIndex() + 1,
      Home: 0,
      End: this.productFeatures.length - 1
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    this.scrollProductTo(targets[event.key]);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(open => !open);
  }

  closeMobileMenu(restoreFocus = false): void {
    this.mobileMenuOpen.set(false);
    if (restoreFocus) this.document.getElementById('landing-menu-toggle')?.focus();
  }

  onHeaderFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.document.getElementById('landing-header')?.contains(next)) this.closeMobileMenu();
  }

  setAudience(audience: Audience): void {
    this.activeAudience = audience;
  }

  toggleFaq(index: number): void {
    this.activeFaqIndex = this.activeFaqIndex === index ? null : index;
  }
}
