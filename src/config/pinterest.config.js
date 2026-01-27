export const PINTEREST_ENV = {
  PRODUCTION: 'production',
  SANDBOX: 'sandbox'
};

export const PINTEREST_OAUTH = {
  SCOPES: [
    'pins:read',
    'pins:write',
    'boards:read',
    'boards:write',
    'user_accounts:read'
  ],

  production: {
    AUTHORIZE_URL: 'https://www.pinterest.com/oauth',
    TOKEN_URL: 'https://api.pinterest.com/v5/oauth/token',
    API_BASE_URL: 'https://api.pinterest.com/v5'
  },

  sandbox: {
    AUTHORIZE_URL: 'https://www.pinterest.com/oauth',
    TOKEN_URL: 'https://api-sandbox.pinterest.com/v5/oauth/token',
    API_BASE_URL: 'https://api-sandbox.pinterest.com/v5'
  }
};

export const PINTEREST_API_ENDPOINTS = {
  // User
  USER_ME: '/user_account',

  // Boards
  BOARDS: '/boards',
  BOARD_PINS: (boardId) => `/boards/${boardId}/pins`,

  // Pins
  CREATE_PIN: '/pins',
  GET_PIN: (pinId) => `/pins/${pinId}`,
  // GET_ALL_PINS:() => `boards/${boardId}/pins`,
  // Media
  MEDIA_UPLOAD: '/media'
};

export function getPinterestConfig(env) {
  return PINTEREST_OAUTH[env] || PINTEREST_OAUTH.sandbox;
}
