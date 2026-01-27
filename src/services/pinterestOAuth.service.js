import axios from 'axios';
import { PINTEREST_ENV, PINTEREST_OAUTH, getPinterestConfig, PINTEREST_API_ENDPOINTS } from '../config/pinterest.config.js';

async function getBasicAuthHeader(clientId, clientSecret) {
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${token}`;
}

export async function exchangeCodeForToken(code) {
  try {
    const env = PINTEREST_ENV.SANDBOX; // switch after approval
    const { TOKEN_URL, API_BASE_URL } = getPinterestConfig(env);
    const auth = await getBasicAuthHeader(process.env.PINTEREST_CLIENT_ID, process.env.PINTEREST_CLIENT_SECRET)

    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.PINTEREST_REDIRECT_URI,
        continuous_refresh: true
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': auth,
        }
      }
    );

    return response.data;
  }
  catch (err) {
    console.error("Error: ", err);
  }
}

export async function getPinterestUserData(access_token) {
  try {
    const env = PINTEREST_ENV.SANDBOX; // switch after approval
    const { API_BASE_URL } = getPinterestConfig(env);
    const res = await axios.get(
      `${API_BASE_URL}${PINTEREST_API_ENDPOINTS.USER_ME}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      }
    );

    // console.log(res.data);
    return res
  }
  catch (err) {
    console.error("Error: ", err);
  }
}

export async function createPinterestBoard(access_token, name, description) {
  try {
    // const { name, description } = { name: 'AI', description: 'AI related pins' };
    const env = PINTEREST_ENV.SANDBOX; // switch after approval
    const { API_BASE_URL } = getPinterestConfig(env);

    const response = await axios.post(
      `${API_BASE_URL}/boards`,
      {
        name,
        description
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return (response.data);
  } catch (err) {
    console.error('Create board error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to create board' });
  }
}


export async function getPinterestBoards(access_token) {
  try {
    const env = PINTEREST_ENV.SANDBOX; // switch after approval
    const { API_BASE_URL } = getPinterestConfig(env);
    const res = await axios.get(
      `${API_BASE_URL}${PINTEREST_API_ENDPOINTS.BOARDS}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      }
    );

    return res.data; // contains items[]
  }
  catch (err) {
    console.error('Error fetching boards:', err.response?.data || err);
    throw err;
  }
}

export async function createPinterestPin(access_token, data) {
  try {
    const env = PINTEREST_ENV.SANDBOX; // switch after approval
    const { API_BASE_URL } = getPinterestConfig(env);
    const res = await axios.post(
      `${API_BASE_URL}${PINTEREST_API_ENDPOINTS.CREATE_PIN}`, {
      board_id: data.boardId,
      title: data.title,
      description: data.description,
      media_source: {
        source_type: 'image_url',
        url: 'https://images.unsplash.com/photo-1761839256791-6a93f89fb8b0?auto=format&fit=crop&w=1000&q=80'
      }
    },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.data; // contains id & link
  }
  catch (err) {
    console.error('Error creating pin:', err.response?.data || err);
    throw err;
  }
}

export async function getPinterestPin(access_token, pinId) {
  try {
    const env = PINTEREST_ENV.SANDBOX; // switch after approval
    const { API_BASE_URL } = getPinterestConfig(env);
    const res = await axios.get(
      `${API_BASE_URL}/${PINTEREST_API_ENDPOINTS.GET_PIN(pinId)}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      }
    );

    return res.data;
  }
  catch (err) {
    console.error('Error fetching pin:', err.response?.data || err);
    throw err;
  }
}

/** Get all pins (optionally by board) */
export async function getAllPinterestPins(accessToken, boardId = null) {
  const env = PINTEREST_ENV.SANDBOX; // switch after approval
  const { API_BASE_URL } = getPinterestConfig(env);

  const response = await axios.get(`${API_BASE_URL}${PINTEREST_API_ENDPOINTS.BOARD_PINS(boardId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return response.data.items || response.data;
}


