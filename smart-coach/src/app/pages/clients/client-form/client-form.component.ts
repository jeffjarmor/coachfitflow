import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ClientService } from '../../../services/client.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { CoachService } from '../../../services/coach.service';
import { GymService } from '../../../services/gym.service';
import { MembershipPlanService } from '../../../services/membership-plan.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { CreateClientData } from '../../../models/client.model';
import { MembershipPlan } from '../../../models/membership-plan.model';
import { isPaidIndependentCoach } from '../../../models/coach.model';

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
    private gymService = inject(GymService);
    private membershipPlanService = inject(MembershipPlanService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    clientForm: FormGroup;
    loading = signal<boolean>(false);
    isEditMode = signal<boolean>(false);
    clientId: string | null = null;

    // Admin mode properties
    adminMode = signal<boolean>(false);
    targetCoachId = signal<string | null>(null);
    gymId = signal<string | null>(null);
    isGymContext = signal<boolean>(false);
    canManageMemberships = signal<boolean>(false);
    membershipPlans = signal<MembershipPlan[]>([]);

    constructor() {
        this.clientForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/^[a-zA-Z\u00C0-\u00FF\s]*$/)]],
            email: ['', [Validators.required, Validators.email, Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)]],
            phone: ['', [Validators.pattern(/^[0-9]{8}$/)]],
            address: [''], // Add address control
            membershipPlanId: [''],
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

        this.initializeGymContext();
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
                    membershipPlanId: client.membershipPlanId || '',
                    birthDate,
                    height: client.height,
                    weight: client.weight,
                    goal: client.goal,
                    notes: client.notes || ''
                });

                // Mark form as pristine after Angular's change detection
                setTimeout(() => {
                    this.clientForm.markAsPristine();
                }, 0);
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
                weight: formValue.weight ? Number(formValue.weight) : undefined,
                height: formValue.height ? Number(formValue.height) : undefined,
                goal: formValue.goal?.trim() || ''
            };

            // Membership assignment (gym owners/admin only)
            if (this.isGymContext() && this.canManageMemberships()) {
                const selectedPlan = this.membershipPlans().find(p => p.id === formValue.membershipPlanId);
                if (selectedPlan) {
                    clientData.membershipPlanId = selectedPlan.id;
                    clientData.membershipPlanName = selectedPlan.name;
                    clientData.membershipPrice = selectedPlan.price;
                    clientData.membershipCurrency = selectedPlan.currency || 'CRC';
                } else {
                    clientData.membershipPlanId = '';
                    clientData.membershipPlanName = '';
                    clientData.membershipPrice = 0;
                    clientData.membershipCurrency = 'CRC';
                }
            }

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
            const gymId = coachProfile?.gymId || undefined;

            if (this.isEditMode() && this.clientId) {
                // Update using unified method
                await this.clientService.updateClient(coachId, this.clientId, clientData as CreateClientData, gymId);
                this.toastService.success('Cliente actualizado correctamente');
            } else {
                // Create using unified method
                const newClientId = await this.clientService.createClient(coachId, clientData as CreateClientData, gymId);
                this.toastService.success('Cliente creado correctamente');

                // Send portal invitation email for gym clients or paid independent coaches.
                if (newClientId && formValue.email) {
                    try {
                        if (gymId) {
                            const gym = await this.gymService.getGym(gymId);
                            const gymName = gym?.name || 'tu gimnasio';
                            await this.authService.inviteGymClient(gymId, newClientId, formValue.email, gymName);
                            this.toastService.success('Se envió la invitación al portal al correo del cliente');
                        } else if (isPaidIndependentCoach(coachProfile)) {
                            await this.authService.inviteIndependentClient(
                                coachId,
                                newClientId,
                                formValue.email,
                                coachProfile?.name || 'tu entrenador'
                            );
                            this.toastService.success('Se envió la invitación al portal al correo del cliente');
                        }
                    } catch (inviteError) {
                        // Non-blocking: client was created successfully even if invite email fails
                        console.warn('No se pudo enviar la invitación al portal:', inviteError);
                        const code = (inviteError as any)?.code || '';
                        const message = (inviteError as any)?.message || '';
                        if (code === 'INVITE_RATE_LIMIT' || /rate limit|429/i.test(message)) {
                            this.toastService.show?.(
                                message || 'Cliente creado. Supabase limitó temporalmente el envío del correo. Reintenta en 1-2 minutos.',
                                'warning'
                            );
                        } else {
                            this.toastService.show?.(
                                'Aviso: El cliente fue creado, pero no se pudo enviar la invitación por correo. Inténtalo desde el detalle del cliente.',
                                'warning'
                            );
                        }
                    }
                }
            }

            this.goBack();
        } catch (error) {
            console.error('Error saving client:', error);
            const message = (error as any)?.message || '';
            if (message) {
                this.toastService.error(message);
            } else {
                this.toastService.error('Error al guardar el cliente');
            }
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

    // Check if submit button should be disabled
    get isSubmitDisabled(): boolean {
        const invalid = this.clientForm.invalid;
        const editMode = this.isEditMode();
        const pristine = this.clientForm.pristine;

        // In edit mode: disable only if pristine (no changes made)
        // In create mode: disable if invalid
        return editMode ? pristine : invalid;
    }

    // Form getters
    get name() { return this.clientForm.get('name'); }
    get email() { return this.clientForm.get('email'); }
    get birthDate() { return this.clientForm.get('birthDate'); }

    private async initializeGymContext() {
        try {
            const userId = this.authService.getCurrentUserId();
            if (!userId) return;

            const coachProfile = await this.coachService.getCoachProfile(userId);
            const gymId = coachProfile?.gymId || null;

            this.gymId.set(gymId);
            this.isGymContext.set(!!gymId);

            if (!gymId) return;

            const [gymCoach, plans] = await Promise.all([
                this.gymService.getGymCoach(gymId, userId),
                this.membershipPlanService.getPlans(gymId)
            ]);

            const isAdmin = coachProfile?.role === 'admin';
            const isOwner = gymCoach?.role === 'owner';
            this.canManageMemberships.set(!!(isAdmin || isOwner));
            this.membershipPlans.set(plans.filter(p => p.active));
        } catch (error) {
            console.error('Error initializing gym membership context:', error);
        }
    }
}
