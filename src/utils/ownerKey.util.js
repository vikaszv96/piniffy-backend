import crypto from 'crypto';
import { getPinterestUserData } from '../services/pinterestOAuth.service.js';

/**
 * Stable owner key per connected Pinterest account (cached on session).
 */
export async function resolveOwnerKey(req) {
  const p = req.session?.pinterest;
  if (!p?.accessToken) {
    console.log('[ownerKey] anon_check', {
      allowDevAnon: process.env.ALLOW_DEV_ANON,
      nodeEnv: process.env.NODE_ENV,
      hasSession: !!req.session,
      hasPinterestSession: !!p,
    });
    // Dev-only anonymous mode (lets localhost work without Pinterest OAuth/session)
    if (process.env.ALLOW_DEV_ANON === 'true' && process.env.NODE_ENV !== 'production') {
      return 'dev:anonymous';
    }

    const err = new Error('Not authenticated');
    err.statusCode = 401;
    throw err;
  }

  if (p.ownerKey) {
    return p.ownerKey;
  }

  try {
    const axiosRes = await getPinterestUserData(p.accessToken);
    const data = axiosRes?.data ?? axiosRes;
    const username = data?.username ?? data?.id;
    if (username) {
      p.ownerKey = `pinterest:${String(username)}`;
      return p.ownerKey;
    }
  } catch (e) {
    console.warn('[ownerKey] Pinterest /user_account failed, falling back to token hash:', e?.message);
  }

  const hash = crypto
    .createHash('sha256')
    .update(p.accessToken)
    .digest('hex')
    .slice(0, 32);
  p.ownerKey = `pinterest_token:${hash}`;
  return p.ownerKey;
}
