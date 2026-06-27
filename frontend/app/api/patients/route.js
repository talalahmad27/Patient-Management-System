import { auth0 } from '../../../lib/auth0';

export async function POST(request) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.tokenSet.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  return Response.json(json, { status: res.status });
}
