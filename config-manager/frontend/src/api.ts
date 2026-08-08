export const API = {
  authStatus: '/api/auth/status',
  authLogin: '/api/auth/login',
  authLogout: '/api/auth/logout',
  config: '/api/config',
  appConfig: '/api/app-config',
  recordings: '/api/recordings',
  video: (file: string) => `/api/video/${file.split('/').map(encodeURIComponent).join('/')}`,
} as const;
