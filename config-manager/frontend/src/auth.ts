export interface AuthStatus {
  loginEnabled: boolean;
  authenticated: boolean;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await fetch('/api/auth/status', { credentials: 'include' });
  if (!response.ok) throw new Error('无法获取登录状态');
  const data = await response.json() as Partial<AuthStatus> & { success?: boolean };
  if (!data.success) throw new Error('无法获取登录状态');
  return {
    loginEnabled: data.loginEnabled === true,
    authenticated: data.authenticated === true,
  };
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}
