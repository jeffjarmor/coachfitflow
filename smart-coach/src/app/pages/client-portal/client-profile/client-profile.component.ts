import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { GymClientService } from '../../../services/gym-client.service';
import { ToastService } from '../../../services/toast.service';
import { Client } from '../../../models/client.model';
import { Measurement } from '../../../models/measurement.model';

@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './client-profile.component.html',
  styleUrls: ['./client-profile.component.scss']
})
export class ClientProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private gymClientSvc = inject(GymClientService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  profile = this.authService.gymClientProfile;
  clientData = signal<Client | null>(null);
  latestMeasurement = signal<Measurement | null>(null);
  loading = signal(true);
  saving = signal(false);
  isEditing = signal(false);

  profileForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    phone: [''],
    birthDate: [''],
    notes: ['']
  });

  async ngOnInit() {
    // Wait for auth to resolve
    let p = this.profile();
    if (!p) {
      p = await this.waitForProfile();
    }
    if (!p) { this.router.navigate(['/login']); return; }

    const [client, measurements] = await Promise.all([
      this.gymClientSvc.getMyClientData(p.gymId, p.clientId),
      this.gymClientSvc.getMyMeasurements(p.gymId, p.clientId)
    ]);

    this.clientData.set(client);
    this.latestMeasurement.set(measurements[0] ?? null);

    if (client) {
      const bDate = this.parseDate(client.birthDate);
      this.profileForm.patchValue({
        name: client.name || '',
        phone: client.phone || '',
        birthDate: bDate ? bDate.toISOString().split('T')[0] : '',
        notes: client.notes || ''
      });
    }

    this.loading.set(false);
  }

  private waitForProfile(): Promise<typeof this.profile extends () => infer T ? T : never> {
    return new Promise(resolve => {
      let attempts = 0;
      const interval = setInterval(() => {
        const p = this.profile();
        if (p || attempts >= 25) {
          clearInterval(interval);
          resolve(p as any);
        }
        attempts++;
      }, 100);
    });
  }

  private parseDate(d: any): Date | null {
    if (!d) return null;
    if (typeof d.toDate === 'function') return d.toDate();
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  get joinedDateFormatted(): string {
    const date = this.parseDate(this.clientData()?.createdAt);
    if (!date) return '—';
    return date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  }

  get birthDateFormatted(): string {
    const date = this.parseDate(this.clientData()?.birthDate);
    if (!date) return '—';
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  get age(): number | string {
    const birthDate = this.parseDate(this.clientData()?.birthDate);
    if (!birthDate) return '—';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  get currentWeight(): string {
    return this.latestMeasurement()?.weight ? `${this.latestMeasurement()!.weight} kg` : '—';
  }

  get currentHeight(): string {
    return this.latestMeasurement()?.height ? `${this.latestMeasurement()!.height} cm` : '—';
  }

  toggleEdit() {
    this.isEditing.set(!this.isEditing());
    if (!this.isEditing() && this.clientData()) {
      // Cancel edit: reset form
      const c = this.clientData()!;
      const bDate = this.parseDate(c.birthDate);
      this.profileForm.patchValue({
        name: c.name || '',
        phone: c.phone || '',
        birthDate: bDate ? bDate.toISOString().split('T')[0] : '',
        notes: c.notes || ''
      });
    }
  }

  async saveProfile() {
    if (this.profileForm.invalid) {
      this.toastService.error('Por favor, completa los campos requeridos.');
      return;
    }

    const p = this.profile();
    if (!p) return;

    this.saving.set(true);
    try {
      const formVal = this.profileForm.value;
      const updateData: Partial<Client> = {
        name: formVal.name,
        phone: formVal.phone,
        notes: formVal.notes
      };
      if (formVal.birthDate) {
        // Ensure correct date parsing without timezone shift issues
        const parts = formVal.birthDate.split('-');
        if (parts.length === 3) {
          updateData.birthDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
      }

      await this.gymClientSvc.updateMyClientData(p.gymId, p.clientId, updateData);

      // Update local state
      const currentObj = this.clientData();
      if (currentObj) {
        this.clientData.set({ ...currentObj, ...updateData } as Client);
      }

      this.toastService.success('Perfil actualizado correctamente');
      this.isEditing.set(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      this.toastService.error('Hubo un error al guardar tu perfil');
    } finally {
      this.saving.set(false);
    }
  }
}
