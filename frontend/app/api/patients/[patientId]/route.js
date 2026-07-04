import { auth0 } from '../../../../lib/auth0';

export async function DELETE(request, { params }) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { patientId } = await params;

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${session.tokenSet.accessToken}`,
    },
  });

  if (res.status === 204) {
    return new Response(null, { status: 204 });
  }

  const json = await res.json();
  return Response.json(json, { status: res.status });
}

export async function PATCH(request, { params }) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { patientId } = await params;
  const body = await request.json();

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients/${patientId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.tokenSet.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  return Response.json(json, { status: res.status });
}
