/**
 * Vérifie les ID tokens Firebase sans service account.
 * Utilise les JWKS publiques Google pour valider la signature RS256.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
if (!PROJECT_ID) console.warn('[AUTH] FIREBASE_PROJECT_ID manquant — auth désactivée');

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export async function verifyFirebaseToken(token) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
    algorithms: ['RS256'],
  });
  if (!payload.sub) throw new Error('token sans sub');
  return { uid: payload.sub, email: payload.email || null };
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'token manquant' });
  verifyFirebaseToken(token)
    .then(user => { req.user = user; next(); })
    .catch(e => res.status(401).json({ error: 'token invalide', detail: e.message }));
}
