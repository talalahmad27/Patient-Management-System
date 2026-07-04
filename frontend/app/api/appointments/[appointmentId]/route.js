import { auth0 } from '../../../../lib/auth0';

export async function DELETE(request, { params }) {
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { appointmentId } = await params;

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/appointments/${appointmentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${session.tokenSet.accessToken}`,
    },
  });

  const json = await res.json();
  return Response.json(json, { status: res.status });
}
