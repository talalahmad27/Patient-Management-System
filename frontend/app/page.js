import { auth0 } from '../lib/auth0';
import { redirect } from 'next/navigation';
import PatientGrid from './patients/PatientGrid';

async function getPatients(accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

export default async function PatientsPage() {
  let accessToken;
  try {
    const session = await auth0.getSession();
    if (!session) redirect('/auth/login');
    accessToken = session.tokenSet.accessToken;
  } catch {
    redirect('/auth/login');
  }

  const patients = await getPatients(accessToken);

  return <PatientGrid patients={patients} />;
}
