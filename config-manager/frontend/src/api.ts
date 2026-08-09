export const API = {
  authStatus: '/api/auth/status',
  authLogin: '/api/auth/login',
  authLogout: '/api/auth/logout',
  config: '/api/config',
  appConfig: '/api/app-config',
  recordings: '/api/recordings',
  recordingDownload: (file: string) =>
    `/api/recordings/download?file=${encodeURIComponent(file)}`,
  recordingThumb: (file: string) =>
    `/api/recordings/thumb?file=${encodeURIComponent(file)}`,
  recordingStatus: '/api/recording-status',
  recordingStatusStream: '/api/recording-status/stream',
  video: (file: string) => `/api/video/${file.split('/').map(encodeURIComponent).join('/')}`,
} as const;
