import { auth0 } from '../../lib/auth0';
import { redirect } from 'next/navigation';
import BookAppointmentForm from './BookAppointmentForm';
import CancelAppointmentButton from './CancelAppointmentButton';
import AppointmentStatus from './AppointmentStatus';
import DatePicker from './DatePicker';

async function getRole(accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/staff/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.role || null;
}

async function getAppointments(date, accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/appointments?date=${date}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

async function getPatients(accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/patients?limit=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

async function getStaff(accessToken) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/staff`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function generateSlots(dateStr) {
  const slots = [];
  for (let hour = 8; hour < 20; hour++) {
    for (const min of [0, 30]) {
      const slotStart = new Date(`${dateStr}T00:00:00`);
      slotStart.setHours(hour, min, 0, 0);
      slots.push(slotStart);
    }
  }
  return slots;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

export default async function AppointmentsPage({ searchParams }) {
  let accessToken;
  try {
    const session = await auth0.getSession();
    if (!session) redirect('/auth/login');
    accessToken = session.tokenSet.accessToken;
  } catch {
    redirect('/auth/login');
  }

  const params = await searchParams;
  const date = params.date || toDateStr(new Date());

  const [role, appointments, patients, staff] = await Promise.all([
    getRole(accessToken),
    getAppointments(date, accessToken),
    getPatients(accessToken),
    getStaff(accessToken),
  ]);

  const canBook = role === 'receptionist' || role === 'admin';
  const isAdmin = role === 'admin';
  const doctors = staff.filter(s => s.role !== 'receptionist');

  const slots = generateSlots(date);
  const byAppointmentId = new Map();
  for (const appt of appointments) {
    if (appt.status === 'cancelled') continue;
    // Bucket into the 30-min slot the appointment falls within, so an
    // off-the-half-hour time (e.g. 2:40) still shows under its 2:30 slot
    // instead of vanishing on an exact-timestamp match.
    const start = new Date(appt.scheduled_start);
    const slotStart = new Date(start);
    slotStart.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
    const key = slotStart.getTime();
    if (!byAppointmentId.has(key)) byAppointmentId.set(key, []);
    byAppointmentId.get(key).push(appt);
  }

  return (
    <div className="pb-12">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Appointments</h1>
        <p className="text-slate-500 mt-1">Day view — book and manage patient appointments</p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <DatePicker date={date} />

        {canBook && (
          <BookAppointmentForm date={date} patients={patients} doctors={doctors} />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {slots.map(slot => {
          const key = slot.getTime();
          const slotAppointments = byAppointmentId.get(key) || [];
          return (
            <div key={key} className="flex border-b border-slate-100 last:border-0">
              <div className="w-24 shrink-0 px-4 py-3 text-sm font-medium text-slate-500 border-r border-slate-100">
                {formatTime(slot)}
              </div>
              <div className="flex-1 px-4 py-3 space-y-2">
                {slotAppointments.length === 0 ? (
                  <span className="text-sm text-slate-300">—</span>
                ) : (
                  slotAppointments.map(appt => {
                    const isPast = new Date(appt.scheduled_start) <= new Date();
                    const tint = appt.status === 'completed'
                      ? 'bg-emerald-50 border-emerald-200'
                      : appt.status === 'no_show'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-teal-50 border-teal-200';
                    return (
                      <div
                        key={appt.appointment_id}
                        className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2 ${tint}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            <span className="text-teal-700">{formatTime(new Date(appt.scheduled_start))}</span> · {appt.patient_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            with {appt.staff_name} · {appt.duration_minutes} min · <span className="capitalize">{appt.appointment_type.replace('_', ' ')}</span>
                            {appt.reason && ` · ${appt.reason}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <AppointmentStatus
                            appointmentId={appt.appointment_id}
                            status={appt.status}
                            isPast={isPast}
                            canManage={canBook}
                            isAdmin={isAdmin}
                          />
                          {canBook && appt.status === 'scheduled' && (
                            <CancelAppointmentButton appointmentId={appt.appointment_id} />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
