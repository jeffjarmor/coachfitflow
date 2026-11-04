import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';
import { environment } from '../../../environments/environment';
import {
  CoachBillingSnapshot,
  isLocalBillingEndpoint
} from './coach-billing.models';

export type BillingSimulationScenario = 'success' | 'decline' | 'requires_action' | 'renewal_failed';

export interface BillingCardholder {
  name: string;
  email: string;
}

interface BillingActionError {
  error?: { code?: string; message?: string };
}

interface OnvoPaymentMethodResponse {
  id?: string;
  customerId?: string;
  status?: string;
  mode?: string;
}

@Injectable({ providedIn: 'root' })
export class CoachBillingService {
  private readonly supabase = inject(SupabaseService).client;

  async status(): Promise<CoachBillingSnapshot> {
    return this.request('status');
  }

  async subscribe(): Promise<CoachBillingSnapshot> {
    return this.request('subscribe');
  }

  async reconcile(): Promise<CoachBillingSnapshot> {
    return this.request('reconcile');
  }

  async cancel(): Promise<CoachBillingSnapshot> {
    return this.request('cancel');
  }

  async simulate(scenario: BillingSimulationScenario): Promise<CoachBillingSnapshot> {
    this.assertLocalSupabase();
    return this.request('simulate', { scenario });
  }

  async changePaymentMethod(paymentMethodId: string): Promise<CoachBillingSnapshot> {
    if (!paymentMethodId || paymentMethodId.length > 160) throw new Error('The payment method could not be verified.');
    return this.request('change-payment-method', { paymentMethodId });
  }

  async tokenizeReplacementCard(form: HTMLFormElement, snapshot: CoachBillingSnapshot, cardholder: BillingCardholder): Promise<string> {
    this.assertLocalSupabase();
    if (snapshot.mode !== 'onvo_test' || !snapshot.configured) {
      throw new Error('Card replacement is available after ONVO test billing is configured.');
    }
    const publicKey = snapshot.publicKey;
    const customerId = snapshot.subscription?.customerId;
    if (!publicKey?.startsWith('onvo_test_') || !customerId) {
      throw new Error('ONVO test billing is not ready to save a replacement card.');
    }

    const values = new FormData(form);
    const number = String(values.get('cardNumber') || '').replace(/[\s-]/g, '');
    const expiry = String(values.get('expiry') || '');
    const [yearPart, monthPart] = expiry.split('-');
    const expMonth = Number(monthPart);
    const expYear = Number(yearPart);
    const cvv = String(values.get('securityCode') || '');
    const holderName = String(values.get('holderName') || '').trim();
    if (!/^\d{12,19}$/.test(number) || !Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12
      || !Number.isInteger(expYear) || !holderName || !/^\d{3,4}$/.test(cvv)) {
      throw new Error('Check the card number, expiry, cardholder name, and security code.');
    }

    let response: Response;
    try {
      response = await fetch('https://api.onvopay.com/v1/payment-methods', {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          Authorization: `Bearer ${publicKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'card',
          customerId,
          card: { number, expMonth, expYear, holderName, cvv },
          billing: { name: cardholder.name, email: cardholder.email, address: { country: 'CR' } }
        })
      });
    } catch {
      throw new Error('ONVO could not be reached. Check your connection and try again.');
    }

    if (!response.ok) throw new Error('ONVO could not save this card. Check the details or try another card.');
    let method: OnvoPaymentMethodResponse;
    try {
      method = await response.json() as OnvoPaymentMethodResponse;
    } catch {
      throw new Error('ONVO returned an incomplete card response. Try again.');
    }
    if (!method.id || method.customerId !== customerId || method.status !== 'active' || !['test', 'onvo_test'].includes(method.mode || '')) {
      throw new Error('ONVO could not verify this card for the current subscription. Try another card.');
    }
    return method.id;
  }

  private async request(action: 'status' | 'subscribe' | 'reconcile' | 'cancel' | 'change-payment-method' | 'simulate', fields: Record<string, string> = {}): Promise<CoachBillingSnapshot> {
    this.assertLocalSupabase();
    const { data, error } = await this.supabase.functions.invoke<CoachBillingSnapshot | BillingActionError>('coach-billing', {
      body: { action, ...fields }
    });
    if (error) throw await this.friendlyError(error);
    if (data && 'error' in data && data.error) throw this.billingError(data.error.code, data.error.message);
    if (!data || !('plan' in data) || !('subscription' in data) || !('configured' in data)) {
      throw new Error('Billing returned an incomplete response. Reload the page and try again.');
    }
    return data as CoachBillingSnapshot;
  }

  private assertLocalSupabase(): void {
    if (environment.production || !isLocalBillingEndpoint(environment.supabase.url)) {
      throw new Error('Local billing tests are only available with the local development database.');
    }
  }

  private async friendlyError(error: unknown): Promise<Error> {
    const context = (error as { context?: Response } | null)?.context;
    if (context && typeof context.clone === 'function') {
      try {
        const body = await context.clone().json() as BillingActionError;
        if (body.error) return this.billingError(body.error.code, body.error.message);
      } catch { /* Keep network errors generic and avoid showing raw provider details. */ }
    }
    const code = (error as { code?: string } | null)?.code;
    if (code === 'FunctionsFetchError' || code === 'FunctionsRelayError') {
      return this.billingError(code, 'Billing is temporarily unavailable. Check your connection and try again.');
    }
    return this.billingError(code, 'We couldn’t complete that billing request. Review your details and try again.');
  }

  private billingError(code?: string, _detail?: string): Error & { code?: string } {
    const messages: Record<string, string> = {
      legacy_pro_active: 'Pro access is already paid for through the date shown. You can start billing after that date.',
      billing_not_configured: 'The Pro plan is not configured for this environment.',
      subscription_conflict: 'A billing change is already being processed. Check the latest status before trying again.'
    };
    const message = code && messages[code] ? messages[code] : 'We couldn’t complete that billing request. Try again.';
    return Object.assign(new Error(message), { code });
  }
}
