import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CoachService } from '../../services/coach.service';
import { AuthService } from '../../services/auth.service';
import { ButtonComponent } from '../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../components/navigation/page-header/page-header.component';
import { Coach } from '../../models/coach.model';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, ButtonComponent, PageHeaderComponent, RouterModule],
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss']
})
export class ProfileComponent {
    private fb = inject(FormBuilder);
    private coachService = inject(CoachService);
    private authService = inject(AuthService);

    profileForm: FormGroup;
    loading = signal<boolean>(false);
    saving = signal<boolean>(false);

    // Logo upload state
    selectedLogo: File | null = null;
    logoPreview = signal<string | null>(null);
    uploadProgress = signal<number>(0);

    // Current coach data
    coach = signal<Coach | null>(null);

    // Success/error messages
    successMessage = signal<string | null>(null);
    errorMessage = signal<string | null>(null);

    constructor() {
        this.profileForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            email: [{ value: '', disabled: true }],
            phone: [''],
            brandColor: ['#2196f3', [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]]
        });

        this.loadProfile();
    }

    async loadProfile() {
        try {
            this.loading.set(true);
            const userId = this.authService.getCurrentUserId();

            if (!userId) {
                this.errorMessage.set('No user logged in');
                return;
            }

            const coachData = await this.coachService.getCoachProfile(userId);

            if (coachData) {
                this.coach.set(coachData);
                this.profileForm.patchValue({
                    name: coachData.name,
                    email: coachData.email,
                    phone: coachData.phone || '',
                    brandColor: coachData.brandColor || '#2196f3'
                });

                if (coachData.logoUrl) {
                    this.logoPreview.set(coachData.logoUrl);
                }
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            this.errorMessage.set('Failed to load profile data');
        } finally {
            this.loading.set(false);
        }
    }

    onLogoSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                this.errorMessage.set('Logo file size must be less than 5MB');
                return;
            }

            // Validate file type
            if (!file.type.startsWith('image/')) {
                this.errorMessage.set('Please select a valid image file');
                return;
            }

            this.selectedLogo = file;
            this.errorMessage.set(null);

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                this.logoPreview.set(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    }

    async onSubmit() {
        if (this.profileForm.invalid) {
            this.profileForm.markAllAsTouched();
            return;
        }

        const userId = this.authService.getCurrentUserId();
        if (!userId) {
            this.errorMessage.set('No user logged in');
            return;
        }

        try {
            this.saving.set(true);
            this.successMessage.set(null);
            this.errorMessage.set(null);

            // Upload logo if selected
            if (this.selectedLogo) {
                await this.coachService.uploadLogo(userId, this.selectedLogo);
                this.selectedLogo = null;
            }

            // Update profile data
            const formValue = this.profileForm.getRawValue();
            await this.coachService.updateCoachProfile(userId, {
                name: formValue.name,
                phone: formValue.phone,
                brandColor: formValue.brandColor
            });

            this.successMessage.set('Profile updated successfully!');

            // Reload profile to get updated data
            await this.loadProfile();

            // Clear success message after 3 seconds
            setTimeout(() => this.successMessage.set(null), 3000);
        } catch (error) {
            console.error('Error updating profile:', error);
            this.errorMessage.set('Failed to update profile. Please try again.');
        } finally {
            this.saving.set(false);
        }
    }

    // Form getters
    get name() { return this.profileForm.get('name'); }
    get email() { return this.profileForm.get('email'); }
    get phone() { return this.profileForm.get('phone'); }
    get brandColor() { return this.profileForm.get('brandColor'); }
}
