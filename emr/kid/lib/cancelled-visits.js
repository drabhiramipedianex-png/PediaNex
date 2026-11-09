/**
 * Cancelled ("deleted") visits.
 *
 * A visit is everything recorded for a patient on one date: the appointment,
 * the vitals and the prescription PDF(s). Staff can cancel a visit for 24
 * hours after it was first recorded. Nothing is erased - medical records must
 * be retained (see RETENTION-DECISION.md) - so a cancellation is stored on the
 * patient document as
 *
 *   cancelledVisits: { 'YYYY-MM-DD': { cancelledAt, reason, ... } }
 *
 * and every screen hides whatever belongs to that date and was recorded at or
 * before cancelledAt. Anything recorded on the same date after the
 * cancellation (the patient comes back later that day) still shows.
 *
 * The rule is keyed on date + time rather than a flag on each vitals entry
 * because measurementHistory is merged and rewritten by several pages, and a
 * per-entry flag would be lost whenever an older copy got merged back in.
 */

export const VISIT_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

function toTime(value) {
  if (!value) {
    return 0;
  }
  if (typeof value?.toMillis === 'function') {
    return value.toMillis();
  }
  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toIsoDate(value) {
  const time = toTime(value);
  if (!time) {
    const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  const date = new Date(time);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getEntryTimestamp(entry) {
  return entry?.measuredAt || entry?.createdAtIso || entry?.createdAt || entry?.savedAt || entry?.updatedAt || entry?.timeCreated || '';
}

export function getEntryTime(entry) {
  return toTime(getEntryTimestamp(entry));
}

export function getEntryDate(entry) {
  return toIsoDate(getEntryTimestamp(entry));
}

export function getCancelledVisits(patient) {
  const value = patient?.cancelledVisits;
  return value && typeof value === 'object' ? value : {};
}

export function getVisitCancellation(patient, dateValue) {
  return dateValue ? getCancelledVisits(patient)[dateValue] || null : null;
}

function isCoveredByCancellation(patient, entry) {
  const cancellation = getVisitCancellation(patient, getEntryDate(entry));
  if (!cancellation) {
    return false;
  }
  const cancelledAt = toTime(cancellation.cancelledAt);
  const entryTime = getEntryTime(entry);
  // An entry with no usable time on a cancelled date is treated as part of it.
  return !entryTime || !cancelledAt || entryTime <= cancelledAt;
}

export function isMeasurementEntryCancelled(patient, entry) {
  return isCoveredByCancellation(patient, entry);
}

export function isPrescriptionEntryCancelled(entry, patient = null) {
  if (entry?.cancelled === true) {
    return true;
  }
  if (!patient) {
    return false;
  }
  const storagePath = String(entry?.storagePath || entry?.fullPath || '').replace(/^\/+/, '');
  if (storagePath) {
    const cancelledPaths = Object.values(getCancelledVisits(patient))
      .flatMap((cancellation) => (Array.isArray(cancellation?.storagePaths) ? cancellation.storagePaths : []));
    if (cancelledPaths.includes(storagePath)) {
      return true;
    }
  }
  return isCoveredByCancellation(patient, entry);
}

export function isAppointmentCancelled(patient, dateValue) {
  return Boolean(getVisitCancellation(patient, dateValue));
}

/**
 * When a visit can no longer be cancelled: 24 hours after the first thing
 * recorded for it. A visit with nothing recorded yet (an appointment only)
 * can always be cancelled, so this returns Infinity for it.
 */
export function getVisitCancelDeadline(entries) {
  const times = entries.map(getEntryTime).filter(Boolean);
  return times.length ? Math.min(...times) + VISIT_CANCEL_WINDOW_MS : Infinity;
}
