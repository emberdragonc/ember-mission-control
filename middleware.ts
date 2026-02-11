import { next } from '@vercel/edge';

const VALID_USER = 'opsadmin934';
const VALID_PASS = 'bZffg7WfCtFnZ3Ty';
const COOKIE_NAME = '__ops_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const config = {
  matcher: '/(.*)',
};

export default function middleware(request: Request) {
  const url = new URL(request.url);

  // Parse cookies from request
  const cookies = parseCookies(request.headers.get('cookie') || '');

  // Check if already authenticated via cookie
  if (cookies[COOKIE_NAME] === authToken()) {
    return next();
  }

  // Handle login form POST
  if (url.pathname === '/__auth/login' && request.method === 'POST') {
    return handleLogin(request, url);
  }

  // Check Basic Auth header (for programmatic access)
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const [user, pass] = decoded.split(':');
      if (user === VALID_USER && pass === VALID_PASS) {
        // Set cookie so subsequent requests don't loop
        const response = next();
        response.headers.set(
          'Set-Cookie',
          `${COOKIE_NAME}=${authToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
        );
        return response;
      }
    }
    // Bad credentials — show login page (don't 401 loop)
  }

  // Show login page
  return new Response(loginPage(url.origin), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

async function handleLogin(request: Request, url: URL): Promise<Response> {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const user = params.get('username') || '';
    const pass = params.get('password') || '';

    if (user === VALID_USER && pass === VALID_PASS) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: url.origin + '/',
          'Set-Cookie': `${COOKIE_NAME}=${authToken()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`,
        },
      });
    }

    // Wrong credentials — show login with error
    return new Response(loginPage(url.origin, 'Invalid username or password'), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response(loginPage(url.origin, 'Something went wrong'), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

function authToken(): string {
  // Simple HMAC-like token (not cryptographic, but sufficient for edge password gate)
  const raw = `${VALID_USER}:${VALID_PASS}:ops-ember-2026`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return 'a' + Math.abs(hash).toString(36);
}

function parseCookies(cookieStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of cookieStr.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) result[k] = v.join('=');
  }
  return result;
}

function loginPage(origin: string, error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login — Ember Mission Control</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #020617; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: rgba(15,23,42,0.9); border: 1px solid rgba(139,92,246,0.3); border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 380px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; color: #8B5CF6; }
    .sub { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.25rem; }
    input { width: 100%; padding: 0.625rem 0.75rem; border-radius: 6px; border: 1px solid rgba(139,92,246,0.3); background: #0f172a; color: #e2e8f0; font-size: 1rem; margin-bottom: 1rem; outline: none; }
    input:focus { border-color: #8B5CF6; }
    button { width: 100%; padding: 0.625rem; border-radius: 6px; border: none; background: #8B5CF6; color: white; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #7C3AED; }
    .error { color: #f87171; font-size: 0.875rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🐉 Mission Control</h1>
    <p class="sub">Enter credentials to continue</p>
    ${error ? `<p class="error">${error}</p>` : ''}
    <form method="POST" action="/__auth/login">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}
