import http from './http';
import { API } from './api';

export interface AuthStatus {
  loginEnabled: boolean;
  authenticated: boolean;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const data = await http.get<Partial<AuthStatus> & { success?: boolean }>(API.authStatus);
  if (!data.success) throw new Error('无法获取登录状态');
  return {
    loginEnabled: data.loginEnabled === true,
    authenticated: data.authenticated === true,
  };
}

export async function logout(): Promise<void> {
  await http.post(API.authLogout);
}
