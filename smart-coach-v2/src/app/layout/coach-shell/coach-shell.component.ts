
import { afterEveryRender, Component, computed, ElementRef, HostListener, inject, OnInit, signal, ViewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService } from '../../core/data/coach-data.service';
import { GymContextService } from '../../features/gyms/gym-context.service';
import { gymHome } from '../../features/gyms/gym-access.guard';
import { AppFooterComponent } from '../app-footer/app-footer.component';

interface NavigationItem {
  label: string;
  short: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-coach-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, AppFooterComponent],
  templateUrl: './coach-shell.component.html',
  styleUrl: './coach-shell.component.scss'
})
export class CoachShellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly data = inject(CoachDataService);
  private readonly gyms = inject(GymContextService);
  private readonly router = inject(Router);

  readonly coachName = computed(() =>
    this.data.currentProfile()?.name || this.auth.user()?.email?.split('@')[0] || 'Coach'
  );
  @ViewChild('gymNav') private gymNav?: ElementRef<HTMLElement>;
  @ViewChild('adminNav') private adminNav?: ElementRef<HTMLElement>;
  private readonly lastSubnavTargets = new WeakMap<HTMLElement, string>();
  readonly canScrollGymLeft = signal(false);
  readonly canScrollGymRight = signal(false);
  readonly canScrollAdminLeft = signal(false);
  readonly canScrollAdminRight = signal(false);
  readonly activeGym = this.gyms.activeGym;
  readonly hasGyms = computed(() => this.gyms.gyms().length > 0);
  private readonly baseNavigation = computed((): NavigationItem[] => {
    const context = this.isAdmin() ? null : this.activeGym();
    const route = (path: string) => context ? `/gym/${context.gym.id}/${path}` : `/${path}`;
    return [
    ...(!context || context.role === 'owner' || context.role === 'admin' ? [{ label: 'Resumen', short: 'Inicio', route: context ? gymHome(context).join('/').replace('//', '/') : '/dashboard', icon: 'layout-dashboard' }] : []),
    { label: 'Clientes', short: 'Clientes', route: route('clients'), icon: 'users' },
    { label: 'Rutinas', short: 'Rutinas', route: route('routines'), icon: 'clipboard-check' },
    { label: 'Ejercicios', short: 'Ejercicios', route: route('exercises'), icon: 'barbell' },
    { label: 'Mediciones', short: 'Medidas', route: route('measurements'), icon: 'ruler-measure' }
    ];
  });
  readonly navigation = computed(() => [
    ...this.baseNavigation(),
    ...(this.hasGyms() ? [{ label: 'Gimnasios', short: 'Gimnasios', route: '/gyms', icon: 'users-group' }] : []),
    ...(this.data.currentProfile()?.role === 'admin'
      ? [{ label: 'Administración', short: 'Admin', route: '/admin/coaches', icon: 'user-shield' }]
      : [])
  ]);
  readonly isAdmin = computed(() => this.data.currentProfile()?.role === 'admin');
  readonly footerGymId = computed(() => this.isAdmin() ? null : (this.activeGym()?.gym.id ?? null));
  readonly adminNavigation = [
    { label: 'Entrenadores', route: '/admin/coaches', icon: 'user-star' },
    { label: 'Clientes', route: '/admin/clients', icon: 'users' },
    { label: 'Anuncios', route: '/admin/announcements', icon: 'speakerphone' },
    { label: 'Actividad', route: '/admin/activity', icon: 'activity' },
    { label: 'Mantenimiento', route: '/admin/maintenance', icon: 'tools' },
    { label: 'Catálogo', route: '/exercises/admin', icon: 'library' }
  ];

  constructor() {
    afterEveryRender(() => {
      for (const nav of [this.gymNav?.nativeElement, this.adminNav?.nativeElement]) {
        const active = nav?.querySelector<HTMLElement>('a.active');
        if (nav && active) {
          const target = `${active.getAttribute('href')}:${nav.clientWidth}`;
          if (target !== this.lastSubnavTargets.get(nav)) {
            this.lastSubnavTargets.set(nav, target);
            if (nav.scrollWidth > nav.clientWidth) {
              const item = active.getBoundingClientRect();
              nav.scrollLeft += item.left - nav.getBoundingClientRect().left - (nav.clientWidth - item.width) / 2;
            }
          }
        }
      }
      this.updateSubnavScrollArrows();
    });
  }

  @HostListener('window:resize')
  updateSubnavScrollArrows(): void {
    const mobile = window.innerWidth <= 920;
    for (const { nav, left, right } of [
      { nav: this.gymNav?.nativeElement, left: this.canScrollGymLeft, right: this.canScrollGymRight },
      { nav: this.adminNav?.nativeElement, left: this.canScrollAdminLeft, right: this.canScrollAdminRight }
    ]) {
      left.set(!!nav && mobile && nav.scrollLeft > 1);
      right.set(!!nav && mobile && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
    }
  }

  scrollSubnav(nav: HTMLElement, direction: -1 | 1): void {
    nav.scrollBy({ left: direction * nav.clientWidth * .8, behavior: 'smooth' });
  }

  isAdminNavigationActive(route: string): boolean {
    if (route === '/exercises/admin' && this.isSeedArea()) return true;
    return this.router.isActive(route, {
      paths: 'subset', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored'
    });
  }

  gymNavigation(): NavigationItem[] {
    const context = this.activeGym();
    if (!this.isGymWorkspace() || !context) {
      return [
        { label: 'Mis gimnasios', short: 'Gimnasios', route: '/gyms', icon: 'users-group' },
        { label: 'Unirme', short: 'Unirme', route: '/gym/join', icon: 'heart-handshake' },
        ...(this.isAdmin() ? [{ label: 'Crear gimnasio', short: 'Crear', route: '/gym/onboarding', icon: 'users-group' }] : [])
      ];
    }
    const navigation = [
      ...(context.permissions.canManageSettings ? [{ label: 'Resumen', short: 'Inicio', route: `/gym/dashboard/${context.gym.id}`, icon: 'layout-dashboard' }] : []),
      { label: 'Clientes', short: 'Clientes', route: `/gym/${context.gym.id}/clients`, icon: 'users' },
      { label: 'Rutinas', short: 'Rutinas', route: `/gym/${context.gym.id}/routines`, icon: 'clipboard-check' }
    ];
    if (context.permissions.canViewPayments) {
      navigation.push({ label: 'Pagos', short: 'Pagos', route: `/gym/payments/${context.gym.id}`, icon: 'credit-card' });
    }
    if (context.permissions.canManageStaff) {
      navigation.push({ label: 'Personal', short: 'Equipo', route: `/gym/staff/${context.gym.id}`, icon: 'users-group' });
    }
    if (context.permissions.canManageSettings) {
      navigation.push({ label: 'Configuración', short: 'Ajustes', route: `/gym/settings/${context.gym.id}`, icon: 'user-shield' });
    }
    return navigation;
  }

  activeMobileNavigation(): NavigationItem[] {
    const navigation = this.baseNavigation();
    if (!this.isAdmin() && !this.gyms.gyms().some(context => context.role === 'owner')) return navigation;
    return [
      ...navigation,
      { label: 'Gimnasios', short: 'Gyms', route: '/gyms', icon: 'building-community' },
      ...(this.isAdmin() ? [{ label: 'Administración', short: 'Admin', route: '/admin/coaches', icon: 'shield-cog' }] : [])
    ];
  }

  isMobileNavigationActive(item: NavigationItem): boolean {
    if (item.route === '/gyms') return this.isGymArea() && (this.isAdmin() || !this.isGymWorkspace());
    if (item.route === '/admin/coaches') return this.isAdminArea();
    if (this.isAdminArea()) return false;
    return this.router.isActive(item.route, {
      paths: item.route === '/dashboard' ? 'exact' : 'subset',
      queryParams: 'ignored',
      matrixParams: 'ignored',
      fragment: 'ignored'
    });
  }

  gymDisplayName(name: string): string {
    return name.replace(/^Gimnasio\s+/i, '');
  }

  isGymWorkspace(): boolean {
    const path = this.router.url.split('?')[0].split('#')[0];
    return this.isGymArea() && !['/gyms', '/gym/join', '/gym/onboarding'].includes(path);
  }

  isGymArea(): boolean {
    return this.router.url.startsWith('/gym') || this.router.url.startsWith('/gyms');
  }

  isAdminArea(): boolean {
    return this.router.url.startsWith('/admin/')
      || this.router.url.startsWith('/exercises/admin')
      || this.router.url.startsWith('/seed-exercises');
  }

  mainPageBackLink(): { route: string; label: string } | null {
    const path = this.router.url.split(/[?#]/)[0];
    const gymPage = path.match(/^\/gym\/([^/]+)\/(clients|routines|exercises|measurements)$/);
    const gymDashboard = /^\/gym\/dashboard\/[^/]+$/.test(path);
    const accountPage = ['/clients', '/routines', '/exercises', '/exercises-astra', '/measurements', '/gyms', '/profile'].includes(path);

    if (!accountPage && !gymPage && !gymDashboard) return null;
    if (gymDashboard) return { route: '/gyms', label: 'Volver a mis gimnasios' };

    const context = this.activeGym();
    const useGymHome = context && (gymPage ? context.gym.id === gymPage[1] : !this.isAdmin());
    const home = useGymHome ? gymHome(context).join('/') : gymPage ? '/gyms' : '/dashboard';
    const route = home === path ? '/gyms' : home;
    return { route, label: route === '/gyms' ? 'Volver a mis gimnasios' : 'Volver al inicio' };
  }

  isSeedArea(): boolean {
    return this.router.url.split(/[?#]/)[0] === '/seed-exercises';
  }

  async ngOnInit(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    try {
      await this.auth.ensureCoachProfileForCurrentUser();
      const profile = await this.data.getProfile(userId);
      await this.gyms.loadAccessibleGyms(userId, profile.role);
    } catch {}
  }

  async logout(): Promise<void> {
    this.gyms.clear();
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
