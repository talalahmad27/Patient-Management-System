import { auth0 } from './lib/auth0';

export async function proxy(request) {
  return await auth0.middleware(request);
}
