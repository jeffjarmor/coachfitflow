const crypto = require('node:crypto');

const DEFAULT_FIREBASE_API_KEY = 'AIzaSyAcsJPa5Xh5ut7l5Q-vTuogptaJoX_KM7I';
const DEFAULT_PROJECT_ID = 'smart-coach-e479b';

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function parseServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const rawB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

  if (rawJson) return JSON.parse(rawJson);
  if (rawB64) return JSON.parse(Buffer.from(rawB64, 'base64').toString('utf8'));

  throw new Error('Missing service account credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64.');
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

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(serviceAccount.private_key, 'base64url');
  return `${unsignedToken}.${signature}`;
}

async function getGoogleAccessToken(serviceAccount) {
  const assertion = createJwtAssertion(serviceAccount);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data?.error_description || data?.error || 'Failed to obtain Google access token.');
  }

  return data.access_token;
}

async function getRequesterUid(idToken, apiKey) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });

  const data = await res.json();
  if (!res.ok || !data?.users?.[0]?.localId) {
    throw new Error('Invalid requester token.');
  }

  return data.users[0].localId;
}

async function isRequesterAdmin(projectId, accessToken, uid) {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coaches/${uid}`;
  const res = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) return false;

  const data = await res.json();
  const fields = data?.fields || {};
  const role = fields?.role?.stringValue || '';
  const isAdmin = fields?.isAdmin?.booleanValue === true;

  return role === 'admin' || isAdmin;
}

async function deleteAuthUser(projectId, accessToken, targetUid) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ localId: targetUid })
  });

  const data = await res.json().catch(() => ({}));

  // Idempotent behavior: if user was already deleted, we still treat as success.
  const msg = data?.error?.message || '';
  if (!res.ok && msg !== 'USER_NOT_FOUND') {
    throw new Error(msg || 'Failed to delete user from Firebase Authentication.');
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { message: 'Method not allowed' });
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(401, { message: 'Missing bearer token' });
    }

    const body = JSON.parse(event.body || '{}');
    const coachId = body?.coachId;
    if (!coachId) {
      return jsonResponse(400, { message: 'coachId is required' });
    }

    const serviceAccount = parseServiceAccount();
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || DEFAULT_PROJECT_ID;
    const webApiKey = process.env.FIREBASE_WEB_API_KEY || DEFAULT_FIREBASE_API_KEY;

    const requesterIdToken = authHeader.replace('Bearer ', '').trim();
    const requesterUid = await getRequesterUid(requesterIdToken, webApiKey);

    const accessToken = await getGoogleAccessToken(serviceAccount);
    const isAdmin = await isRequesterAdmin(projectId, accessToken, requesterUid);

    if (!isAdmin) {
      return jsonResponse(403, { message: 'Only admins can delete Authentication users.' });
    }

    await deleteAuthUser(projectId, accessToken, coachId);

    return jsonResponse(200, {
      success: true,
      message: 'Authentication user deleted successfully.'
    });
  } catch (error) {
    console.error('delete-coach-auth error:', error);
    return jsonResponse(500, {
      message: error?.message || 'Unexpected error deleting Authentication user.'
    });
  }
};
