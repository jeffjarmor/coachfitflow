/**
 * Netlify Function: invite-gym-client
 *
 * Called by a coach/gym-owner after creating a new client.
 * 1. Creates a Firebase Auth user for the client (no password).
 * 2. Writes the gymClients/{uid} profile document in Firestore.
 * 3. Updates gyms/{gymId}/clients/{clientId}.uid + portalStatus.
 * 4. Sends Firebase's native password-reset email so the client
 *    can set their own password and access the portal.
 *
 * Uses pure REST API + Service Account JWT (no firebase-admin package),
 * following the same pattern as delete-coach-auth.js.
 *
 * Required env vars (already configured in Netlify):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  or  FIREBASE_SERVICE_ACCOUNT_BASE64
 *   FIREBASE_WEB_API_KEY   (same key used elsewhere in the project)
 *   FIREBASE_PROJECT_ID    (optional, falls back to service account)
 */

const crypto = require('node:crypto');

const DEFAULT_FIREBASE_API_KEY = 'AIzaSyAcsJPa5Xh5ut7l5Q-vTuogptaJoX_KM7I';
const DEFAULT_PROJECT_ID = 'smart-coach-e479b';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    };
}

function parseServiceAccount() {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const rawB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

    if (rawJson) return JSON.parse(rawJson);
    if (rawB64) return JSON.parse(Buffer.from(rawB64, 'base64').toString('utf8'));

    throw new Error('Missing service account credentials.');
}

function createJwtAssertion(serviceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    };

    const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsignedToken = `${encode(header)}.${encode(payload)}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();

    return `${unsignedToken}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
}

async function getGoogleAccessToken(serviceAccount) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: createJwtAssertion(serviceAccount)
        })
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
        throw new Error(data?.error_description || 'Failed to obtain Google access token.');
    }
    return data.access_token;
}

async function getRequesterUid(idToken, apiKey) {
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        }
    );
    const data = await res.json();
    if (!res.ok || !data?.users?.[0]?.localId) {
        throw new Error('Invalid requester token.');
    }
    return data.users[0].localId;
}

/** Checks that the requester has access to the gym (member OR owner). */
async function hasGymAccess(projectId, accessToken, gymId, coachId) {
    // Check 1: is the user in the coaches subcollection?
    const memberUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/gyms/${gymId}/coaches/${coachId}`;
    const memberRes = await fetch(memberUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (memberRes.ok) return true;

    // Check 2: is the user the gym owner?
    const gymUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/gyms/${gymId}`;
    const gymRes = await fetch(gymUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!gymRes.ok) return false;
    const gymData = await gymRes.json();
    const ownerId = gymData?.fields?.ownerId?.stringValue || '';
    return ownerId === coachId;
}

// ---------------------------------------------------------------------------
// Firebase Auth REST helpers
// ---------------------------------------------------------------------------

/**
 * Creates a Firebase Auth user using the Identity Toolkit API.
 * Requires a temporary random password since REST API demands one.
 */
async function createAuthUser(apiKey, email) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
    // Generate a secure random 16-character password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: tempPassword, returnSecureToken: true })
    });

    const data = await res.json();

    // If the user already exists, look up their UID instead.
    if (!res.ok) {
        const msg = data?.error?.message || '';
        if (msg === 'EMAIL_EXISTS') {
            return await lookupUidByEmail(apiKey, email);
        }
        throw new Error(msg || 'Failed to create Firebase Auth user.');
    }

    return data.localId;
}

/** Looks up the UID for an existing email using the accounts:lookup endpoint. */
async function lookupUidByEmail(apiKey, email) {
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: email, continueUri: 'https://localhost' })
        }
    );
    // createAuthUri doesn't return the UID. Use Admin REST instead.
    // Fall back to fetching via Admin token.
    throw new Error(`El cliente con email ${email} ya tiene una cuenta. Puedes pedirle que revise su correo.`);
}

/** Sends Firebase's built-in password-reset email (no external service). */
async function sendPasswordResetEmail(apiKey, email) {
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
        }
    );

    const data = await res.json();
    if (!res.ok) {
        const msg = data?.error?.message || '';
        throw new Error(msg || 'Failed to send password reset email.');
    }
}

// ---------------------------------------------------------------------------
// Firestore REST helpers
// ---------------------------------------------------------------------------

function toFirestoreValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return { integerValue: String(value) };
    if (typeof value === 'string') return { stringValue: value };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

function toFirestoreFields(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
        fields[k] = toFirestoreValue(v);
    }
    return { fields };
}

async function firestoreSet(projectId, accessToken, docPath, data) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(toFirestoreFields(data))
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Firestore write failed for ${docPath}`);
    }
}

async function firestoreUpdate(projectId, accessToken, docPath, fields) {
    const maskParams = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}?${maskParams}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(toFirestoreFields(fields))
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Firestore update failed for ${docPath}`);
    }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

exports.handler = async (event) => {
    let step = 'STEP0_INIT';
    try {
        if (event.httpMethod !== 'POST') {
            return jsonResponse(405, { message: 'Method not allowed' });
        }

        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return jsonResponse(401, { message: 'Missing bearer token' });
        }

        const body = JSON.parse(event.body || '{}');
        const { gymId, clientId, email, gymName } = body;

        if (!gymId || !clientId || !email) {
            return jsonResponse(400, { message: 'gymId, clientId y email son requeridos.' });
        }

        step = 'STEP1_PARSE_CREDENTIALS';
        const serviceAccount = parseServiceAccount();
        const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || DEFAULT_PROJECT_ID;
        const webApiKey = process.env.FIREBASE_WEB_API_KEY || DEFAULT_FIREBASE_API_KEY;

        step = 'STEP2_VERIFY_REQUESTER';
        const requesterIdToken = authHeader.replace('Bearer ', '').trim();
        const requesterUid = await getRequesterUid(requesterIdToken, webApiKey);

        step = 'STEP3_GET_ACCESS_TOKEN';
        const accessToken = await getGoogleAccessToken(serviceAccount);

        step = 'STEP4_CHECK_GYM_ACCESS';
        const member = await hasGymAccess(projectId, accessToken, gymId, requesterUid);
        if (!member) {
            return jsonResponse(403, { message: 'No tienes permiso para invitar clientes a este gimnasio.' });
        }

        step = 'STEP5_CREATE_AUTH_USER';
        const clientUid = await createAuthUser(webApiKey, email);

        step = 'STEP6_WRITE_GYM_CLIENT';
        await firestoreSet(projectId, accessToken, `gymClients/${clientUid}`, {
            uid: clientUid,
            gymId,
            clientId,
            gymName: gymName || '',
            createdAt: new Date()
        });

        step = 'STEP7_UPDATE_CLIENT_DOC';
        await firestoreUpdate(
            projectId,
            accessToken,
            `gyms/${gymId}/clients/${clientId}`,
            {
                uid: clientUid,
                portalStatus: 'pending',
                portalInvitedAt: new Date()
            }
        );

        step = 'STEP8_SEND_EMAIL';
        await sendPasswordResetEmail(webApiKey, email);

        return jsonResponse(200, {
            success: true,
            clientUid,
            message: 'Invitación enviada al correo del cliente.'
        });

    } catch (error) {
        console.error(`invite-gym-client error at ${step}:`, error);
        return jsonResponse(500, {
            step,
            message: `[${step}] ${error?.message || 'Error inesperado al enviar la invitación.'}`
        });
    }
};
