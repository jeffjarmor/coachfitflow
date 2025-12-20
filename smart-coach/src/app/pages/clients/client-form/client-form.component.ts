import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ClientService } from '../../../services/client.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
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
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    clientForm: FormGroup;
    loading = signal<boolean>(false);
    isEditMode = signal<boolean>(false);
    clientId: string | null = null;

    constructor() {
        this.clientForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            email: ['', [Validators.required, Validators.email]],
            phone: [''],
            birthDate: ['', [Validators.required]],
            height: [null, [Validators.min(0)]],
            weight: [null, [Validators.min(0)]],
            goal: [''],
            notes: ['']
        });

        // Check if we're in edit mode
        this.route.params.subscribe(async params => {
            if (params['id']) {
                this.isEditMode.set(true);
                this.clientId = params['id'];
                await this.loadClient(this.clientId!);
            }
        });
    }

    async loadClient(id: string) {
        try {
            this.loading.set(true);
            const userId = this.authService.getCurrentUserId();
            if (!userId) return;

            const client = await this.clientService.getClient(userId, id);
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
        const userId = this.authService.getCurrentUserId();

        if (!userId) {
            console.error('No user logged in');
            this.loading.set(false);
            return;
        }

        try {
            const formValue = this.clientForm.value;

            // Construir objeto asegurando no enviar undefined:
            const rawData: any = {
                name: formValue.name,
                email: formValue.email,
                age: this.calculateAge(new Date(formValue.birthDate)),
                weight: formValue.weight != null ? formValue.weight : null,
                height: formValue.height != null ? formValue.height : null,
                goal: formValue.goal?.trim() || null,
                phone: formValue.phone?.trim() || null,
                birthDate: formValue.birthDate ? new Date(formValue.birthDate) : null,
                notes: formValue.notes?.trim() || null
            };
            // Filtrar valores nulos/undefined
            const filtered = Object.entries(rawData)
                .filter(([_, v]) => v !== null && v !== undefined);

            // Convertir a objeto
            const obj = Object.fromEntries(filtered);

            // Forzar a CreateClientData
            const clientData = obj as unknown as CreateClientData;


            if (this.isEditMode() && this.clientId) {
                await this.clientService.updateClient(userId, this.clientId, clientData);
            } else {
                await this.clientService.createClient(userId, clientData);
            }

            this.router.navigate(['/clients']);
        } catch (error) {
            console.error('Error saving client:', error);
            this.toastService.error('Error al guardar el cliente');
        } finally {
            this.loading.set(false);
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
