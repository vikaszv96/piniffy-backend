import crypto from 'crypto';
import { PINTEREST_ENV, PINTEREST_OAUTH, getPinterestConfig } from '../config/pinterest.config.js';
import {
  exchangeCodeForToken, getPinterestUserData, getPinterestBoards, createPinterestPin,
  getPinterestPin, createPinterestBoard, getAllPinterestPins
}
  from '../services/pinterestOAuth.service.js';

export function redirectToPinterest(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  const env = PINTEREST_ENV.SANDBOX; // switch after approval
  const { AUTHORIZE_URL } = getPinterestConfig(env);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.PINTEREST_CLIENT_ID,
    redirect_uri: process.env.PINTEREST_REDIRECT_URI,
    scope: PINTEREST_OAUTH.SCOPES.join(' '),
    state
  });
  console.log(`${AUTHORIZE_URL}?${params.toString()}`);
  res.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
}

export async function pinterestCallback(req, res, next) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    const tokenData = await exchangeCodeForToken(code);

    // TODO: Save token securely (DB + encryption)
    console.log('Pinterest OAuth Success:', tokenData);
    // const userData = await getPinterestUserData(tokenData.access_token)

    req.session.pinterest = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000
    };

    // req.session.user = {
    //   userData: userData
    // }

    res.redirect('http://localhost:4200/dashboard');
    // res.json({ "token": tokenData, "userData": userData.data });
  } catch (err) {
    next(err);
  }
}

/**
 * Get connected Pinterest account details
 */
export const getPinterestMe = async (req, res, next) => {
  try {
    const token = req.session.pinterest.accessToken;

    const response = await getPinterestUserData(token);

    return res.json(response && response.data ? response.data : response.data);
  } catch (error) {
    console.error("Error:", error);
    return next(error);
  }
};

export const createPinBoard = async (req, res, next) => {
  try {
    const token = req.session.pinterest.accessToken;
    const { name, description } = req.body;
    const response = await createPinterestBoard(token, name, description);

    return res.json(response);
  } catch (error) {
    return next(error);
  }
};

export const getPinBoards = async (req, res, next) => {
  try {
    const token = req.session.pinterest.accessToken;

    const response = await getPinterestBoards(token);

    return res.json(response);
  } catch (error) {
    return next(error);
  }
};

export const createPin = async (req, res, next) => {
  try {
    const token = req.session.pinterest.accessToken;
    const { boardId,
      title,
      description,
      imageUrl } = req.body

    const pin = await createPinterestPin(token, {
      boardId: boardId,
      title: title,
      description: description,
      imageUrl: imageUrl
    });

    return res.json({ "statusCode": 200, pin });
  } catch (error) {
    return next(error);
  }
};

export const getPin = async (req, res, next) => {
  try {
    const token = req.session.pinterest.accessToken;

    const fullPin = await getPinterestPin(token, req.query.pin_id);

    return res.json({ "statusCode": 200, fullPin });
  } catch (error) {
    return next(error);
  }
};

/**
 * Disconnect Pinterest (Logout)
 */
export const disconnectPinterest = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({
        error: 'Failed to disconnect Pinterest',
      });
    }

    return res.json({ disconnected: true });
  });
};

/**
 * Get all pins
 * Optional query param:
 *   ?boardId=xxxx
 */
export const getAllPins = async (req, res) => {
  try {
    const accessToken = req.session.pinterest.accessToken;
    const { boardId } = req.params;

    const pins = await getAllPinterestPins(accessToken, boardId);

    res.status(200).json({
      success: true,
      pins
    });
  } catch (error) {
    console.error('Get all pins error:', error?.response?.data || error.message);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch pins',
      message: error?.response?.data || error.message
    });
  }
};
