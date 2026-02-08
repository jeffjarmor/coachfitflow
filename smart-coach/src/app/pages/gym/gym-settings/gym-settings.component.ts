import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GymService } from '../../../services/gym.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { Gym } from '../../../models/gym.model';

@Component({
    selector: 'app-gym-settings',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, ButtonComponent, PageHeaderComponent],
    templateUrl: './gym-settings.component.html',
    styleUrls: ['./gym-settings.component.scss']
})
export class GymSettingsComponent {
    private fb = inject(FormBuilder);
    private gymService = inject(GymService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    gymId = signal<string>('');
    gym = signal<Gym | null>(null);
    loading = signal<boolean>(false);
    saving = signal<boolean>(false);

    // Logo Upload
    selectedLogo: File | null = null;
    logoPreview = signal<string | null>(null);

    settingsForm = this.fb.group({
        name: ['', [Validators.required, Validators.minLength(3)]],
        email: ['', [Validators.email]],
        phone: [''],
        address: [''],
        brandColor: ['#3b82f6'], // Default blue
    });

    accessCode = computed(() => this.gym()?.accessCode || '...');

    constructor() {
        this.route.params.subscribe(params => {
            this.gymId.set(params['id']);
            this.loadGymData();
        });
    }

    async loadGymData() {
        const id = this.gymId();
        if (!id) return;

        try {
            this.loading.set(true);
            const gymData = await this.gymService.getGym(id);

            if (gymData) {
                this.gym.set(gymData);
                this.settingsForm.patchValue({
                    name: gymData.name,
                    email: gymData.email || '',
                    phone: gymData.phone || '',
                    address: gymData.address || '',
                    brandColor: gymData.brandColor || '#3b82f6'
                });

                if (gymData.logoUrl) {
                    this.logoPreview.set(gymData.logoUrl);
                }
            }
        } catch (error) {
            console.error('Error loading gym settings:', error);
        } finally {
            this.loading.set(false);
        }
    }

    onLogoSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];

            // Validate size 5MB
            if (file.size > 5 * 1024 * 1024) {
                alert('El archivo debe ser menor a 5MB');
                return;
            }

            if (!file.type.startsWith('image/')) {
                alert('Por favor selecciona una imagen válida');
                return;
            }

            this.selectedLogo = file;

            // Preview
            const reader = new FileReader();
            reader.onload = (e) => {
                this.logoPreview.set(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    }

    async onSubmit() {
        if (this.settingsForm.invalid) return;

        const id = this.gymId();
        if (!id) return;

        try {
            this.saving.set(true);

            // Filter out null/undefined values
            const formData = this.settingsForm.value;
            const updateData: any = { ...formData };

            await this.gymService.updateGym(id, updateData);

            // Upload Logo if selected
            if (this.selectedLogo) {
                const logoUrl = await this.gymService.uploadLogo(id, this.selectedLogo);
                updateData.logoUrl = logoUrl; // Update local data
                this.selectedLogo = null;
            }

            // Update local state
            const currentGym = this.gym();
            if (currentGym) {
                this.gym.set({ ...currentGym, ...updateData });
            }

            alert('Configuración guardada correctamente');
            this.router.navigate(['/gym/dashboard', id]);

        } catch (error) {
            console.error('Error updating gym settings:', error);
            alert('Error al guardar la configuración');
        } finally {
            this.saving.set(false);
        }
    }
}
