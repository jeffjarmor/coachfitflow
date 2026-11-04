import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { localApiUrl, readLocalStatus } from './billing-local-config.mjs';

const directory = fileURLToPath(new URL('../../.local/onvo-billing', import.meta.url));
const accountFile = `${directory}/trainer.json`;
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Usage: npm run billing:seed [-- --show]\nCreates one synthetic independent trainer in standard local Supabase Docker only.\nExisting application/demo users are not updated. Credentials are saved to .local/onvo-billing/trainer.json.\n--show prints the local test login previously created by this command.');
} else if (args.some(arg => arg !== '--show')) {
  console.error('Unknown option. Use --help or --show.');
  process.exitCode = 1;
} else {
  try {
    let account;
    if (existsSync(accountFile)) {
      account = JSON.parse(readFileSync(accountFile, 'utf8'));
      if (account.apiUrl !== localApiUrl || !account.email?.endsWith('@zummith.test') || !account.password) {
        throw new Error('The saved billing fixture is not a valid local test account.');
      }
    }
    if (args.includes('--show')) {
      if (!account) throw new Error('No local billing trainer exists. Run npm run billing:seed first.');
      console.log(`Local Docker test login\nEmail: ${account.email}\nPassword: ${account.password}`);
    } else {
      const status = readLocalStatus();
      const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      if (account) {
        const { data, error } = await admin.auth.admin.getUserById(account.id);
        if (error || !data.user || data.user.email !== account.email) {
          throw new Error('The saved local test identity no longer exists. Preserve its file and create a new fixture explicitly.');
        }
      } else {
        const suffix = randomUUID().slice(0, 8);
        const email = `developer.billing.${suffix}@zummith.test`;
        const password = `LocalBilling!${randomUUID()}`;
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { name: 'Developer Billing', full_name: 'Developer Billing' }
        });
        if (error || !data.user) throw new Error('Could not create the local billing test identity.');
        const id = data.user.id;
        const { error: profileError } = await admin.from('coaches').upsert({
          id, name: 'Developer Billing', email, role: 'coach', account_type: 'independent',
          coach_plan: 'standard', next_plan_payment_date: null, brand_color: '#CCFF00'
        }, { onConflict: 'id' });
        if (profileError) {
          await admin.auth.admin.deleteUser(id);
          throw new Error('Could not create the local trainer profile; the new Auth fixture was removed.');
        }
        account = { apiUrl: localApiUrl, id, email, password };
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        chmodSync(directory, 0o700);
        writeFileSync(accountFile, `${JSON.stringify(account, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      }
      console.log(`Local trainer ready: ${account.email}\nCredentials: ${accountFile}\nUse npm run billing:seed -- --show to display the local test login.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
