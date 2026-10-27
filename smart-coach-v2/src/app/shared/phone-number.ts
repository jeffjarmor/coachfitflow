import { ValidatorFn } from '@angular/forms';

export const internationalPhoneValidator: ValidatorFn = (control) => {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return value.length <= 40 && /^\+?[0-9\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15
    ? null
    : { phone: true };
};
