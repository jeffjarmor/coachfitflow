import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ClientService } from '../../../services/client.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { CoachService } from '../../../services/coach.service'; // Added CoachService
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { CreateClientData } from '../../../models/client.model';

@Component({
    selector: 'app-client-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonComponent, PageHeaderComponent],
    templateUrl: './client-form.component.html',
    styleUrls: ['./client-form.component.scss']
})
export class ClientFormComponent {
    private fb = inject(FormBuilder);
    private clientService = inject(ClientService);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private coachService = inject(CoachService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    clientForm: FormGroup;
    loading = signal<boolean>(false);
    isEditMode = signal<boolean>(false);
    clientId: string | null = null;

    // Admin mode properties
    adminMode = signal<boolean>(false);
    targetCoachId = signal<string | null>(null);

    constructor() {
        this.clientForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/^[a-zA-Z\u00C0-\u00FF\s]*$/)]],
            email: ['', [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]],
            phone: ['', [Validators.pattern(/^[0-9]{8}$/)]],
            address: [''], // Add address control
            birthDate: ['', [Validators.required]],
            height: [null, [Validators.min(50), Validators.max(300)]],
            weight: [null, [Validators.min(20), Validators.max(500)]],
            goal: [''],
            notes: ['']
        });

        // Check if we're in edit mode
        this.route.params.subscribe(async params => {
            // Check for admin params
            if (params['coachId'] && params['clientId']) {
                this.adminMode.set(true);
                this.targetCoachId.set(params['coachId']);
                this.clientId = params['clientId'];
                this.isEditMode.set(true);
                await this.loadClient(this.clientId!);
            } else if (params['id']) {
                this.isEditMode.set(true);
                this.clientId = params['id'];
                await this.loadClient(this.clientId!);
            }
        });
    }

    async loadClient(id: string) {
        try {
            this.loading.set(true);
            const coachId = this.adminMode() ? this.targetCoachId() : await this.authService.getCurrentUserId();
            if (!coachId) return;

            // Get coach profile to determine gymId
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            // Use unified method with gymId
            const client = await this.clientService.getClient(coachId, id, gymId);

            if (client) {
                // Format date for input
                let birthDate: any = client.birthDate;
                if (birthDate && typeof (birthDate as any).toDate === 'function') {
                    birthDate = (birthDate as any).toDate().toISOString().split('T')[0];
                } else if (birthDate instanceof Date) {
                    birthDate = birthDate.toISOString().split('T')[0];
                }

                this.clientForm.patchValue({
                    name: client.name,
                    email: client.email,
                    phone: client.phone || '',
                    address: client.address || '',
                    birthDate,
                    height: client.height,
                    weight: client.weight,
                    goal: client.goal,
                    notes: client.notes || ''
                });
            }
        } catch (error) {
            console.error('Error loading client:', error);
        } finally {
            this.loading.set(false);
        }
    }

    async onSubmit() {
        if (this.clientForm.invalid) {
            this.clientForm.markAllAsTouched();
            return;
        }

        this.loading.set(true);
        // Ensure coachId is resolved
        const coachId = this.adminMode() ? this.targetCoachId() : await this.authService.getCurrentUserId();

        if (!coachId) {
            console.error('No user logged in');
            this.loading.set(false);
            return;
        }

        try {
            const formValue = this.clientForm.value;

            // Calculate age from birth date
            const birthDate = formValue.birthDate ? new Date(formValue.birthDate) : null;
            const age = birthDate ? this.calculateAge(birthDate) : 0;

            // Build client data object with only defined values
            const clientData: Partial<CreateClientData> = {
                name: formValue.name,
                email: formValue.email,
                age: age,
                weight: formValue.weight || 0,
                height: formValue.height || 0,
                goal: formValue.goal?.trim() || ''
            };

            // Add optional fields only if they have values
            if (formValue.phone?.trim()) {
                clientData.phone = formValue.phone.trim();
            }
            if (formValue.address?.trim()) {
                clientData.address = formValue.address.trim();
            }
            if (birthDate) {
                clientData.birthDate = birthDate;
            }
            if (formValue.notes?.trim()) {
                clientData.notes = formValue.notes.trim();
            }

            // Get coach profile to determine gymId
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            if (this.isEditMode() && this.clientId) {
                // Update using unified method
                await this.clientService.updateClient(coachId, this.clientId, clientData as CreateClientData, gymId);
                this.toastService.success('Cliente actualizado correctamente');
            } else {
                // Create using unified method
                await this.clientService.createClient(coachId, clientData as CreateClientData, gymId);
                this.toastService.success('Cliente creado correctamente');
            }

            this.goBack();
        } catch (error) {
            console.error('Error saving client:', error);
            this.toastService.error('Error al guardar el cliente');
        } finally {
            this.loading.set(false);
        }
    }

    goBack() {
        if (this.adminMode()) {
            this.router.navigate(['/admin/clients', this.targetCoachId(), this.clientId]);
        } else {
            this.router.navigate(['/clients']);
        }
    }

    calculateAge(birthDate: Date): number {
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    // Form getters
    get name() { return this.clientForm.get('name'); }
    get email() { return this.clientForm.get('email'); }
    get birthDate() { return this.clientForm.get('birthDate'); }
}
