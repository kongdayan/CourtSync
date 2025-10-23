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
}

export interface JiushiConfig {
  venueId: string;
  allowedGroundIds: string[];
  maxDays: number;
}
