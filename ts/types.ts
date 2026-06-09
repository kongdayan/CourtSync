export interface UnifiedTimeSlot {
  FacilityID: string;
  Date: string;
  StartTime: string;
  EndTime: string;
  Status: string;
  ActivityName: string;
}

export type DataSourceKey = "usthing" | "jiushi";

export interface AlumniTimeSlot {
  facility_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  activity_name: string;
}

export interface USThingTimeSlot {
  facilityID: number;
  timeslotDate: string;
  startTime: string;
  endTime: string;
  timeslotStatus: string;
  activityName: string;
}

export interface PushDeerConfig {
  pushKeys: string[];
}

export interface USThingConfig {
  ustID: string;
  userType: string;
  facilityIDs: string[];
  bearer?: string;
  /** Azure AD username for dynamic token acquisition */
  username?: string;
  /** Azure AD password for dynamic token acquisition */
  password?: string;
}

/** 设施信息 (v3/msapi/fbs/facilities) */
export interface USThingFacility {
  facilityID: number;
  facilityName: string;
  location: string;
}

/** 预订信息 (v3/msapi/fbs/bookingInfo) */
export interface USThingBookingInfo {
  facilityID: number;
  facilityName: string;
  location: string;
  timeslotDate: string;
  startTime: string;
  endTime: string;
  bookingRef: number;
}

export interface JiushiConfig {
  venueId: string;
  allowedGroundIds: string[];
  maxDays: number;
}
