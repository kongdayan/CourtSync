import { AlumniTimeSlot } from "../types";

type HeaderMap = Record<string, string>;

const DEFAULT_HEADERS: HeaderMap = {
  "Content-Type": "application/json",
  Authorization: "Bearer oEtjM9HkL9aaEnEyabD8",
};

interface AlumniBookingResponse {
  meta: {
    code: number;
    message: string;
  };
}

interface AlumniTimeslotResponse {
  meta: {
    code: number;
    message: string;
  };
  data: {
    facility_timeslots: AlumniTimeSlot[];
  };
}

export async function booking(
  facilityID: string,
  startTime: string,
  endTime: string,
  date: string,
  fetchImpl: typeof fetch = fetch
): Promise<AlumniBookingResponse> {
  const url = "https://w5.ab.ust.hk/msalum/api/app/fbs/bookings";

  const body = JSON.stringify({
    booking: {
      facility_id: facilityID,
      start_time: startTime,
      end_time: endTime,
      date,
    },
  });

  const response = await fetchImpl(url, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Booking failed with ${response.status}: ${response.statusText}. Body: ${text}`
    );
  }

  return (await response.json()) as AlumniBookingResponse;
}

export async function getAvailableTimeSlots(
  facilityID: string,
  startDate: string,
  endDate: string,
  fetchImpl: typeof fetch = fetch
): Promise<AlumniTimeSlot[]> {
  const url = `https://w5.ab.ust.hk/msalum/api/app/fbs/facility-timeslots?facility_id=${encodeURIComponent(
    facilityID
  )}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(
    endDate
  )}`;


  const response = await fetchImpl(url, {
    method: "GET",
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Scan failed with ${response.status}: ${response.statusText}. Body: ${text}`
    );
  }

  const data = (await response.json()) as AlumniTimeslotResponse;

  if (data.meta.code !== 200) {
    throw new Error(`Unexpected response code: ${data.meta.code}`);
  }

  return (data.data.facility_timeslots ?? []).filter(
    (slot) => slot.status === "Available"
  );
}
