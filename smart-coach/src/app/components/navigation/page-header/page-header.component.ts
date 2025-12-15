import { Component, input, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';

@Component({
    selector: 'app-page-header',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './page-header.component.html',
    styleUrls: ['./page-header.component.scss']
})
export class PageHeaderComponent {
    private location = inject(Location);
    private router = inject(Router);

    // Inputs
    title = input.required<string>();
    subtitle = input<string>();
    showBackButton = input<boolean>(true);
    backRoute = input<string>();
    sticky = input<boolean>(true);

    // Computed back route
    computedBackRoute = computed(() => {
        const providedRoute = this.backRoute();
        if (providedRoute) {
            return providedRoute;
        }

        // Auto-detect based on current route
        const currentUrl = this.router.url;

        // Common patterns
        if (currentUrl.includes('/clients/') && currentUrl.includes('/edit')) {
            return currentUrl.replace('/edit', '');
        }
        if (currentUrl.includes('/clients/new')) {
            return '/clients';
        }
        if (currentUrl.includes('/exercises/new')) {
            return '/exercises';
        }
        if (currentUrl.includes('/routines/') && !currentUrl.includes('/new')) {
            return '/clients'; // Routine detail -> back to clients
        }
        if (currentUrl.includes('/routines/new')) {
            return '/dashboard';
        }

        // Default: go back in history
        return null;
    });

    handleBack(): void {
        const route = this.computedBackRoute();
        if (route) {
            this.router.navigate([route]);
        } else {
            this.location.back();
        }
    }
}
