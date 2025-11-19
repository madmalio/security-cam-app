export type MotionType = "off" | "webhook" | "active";

export interface Camera {
  id: number;
  name: string;
  path: string;
  rtsp_url: string;
  rtsp_substream_url: string | null;
  display_order: number;
  motion_type: MotionType;
  motion_roi: string | null;
  motion_sensitivity: number;
  continuous_recording: boolean;
}

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  gravatar_hash: string | null;
}

export interface UserSession {
  id: number;
  jti: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface Event {
  id: number;
  start_time: string;
  end_time: string | null;
  reason: string;
  video_path: string;
  thumbnail_path: string | null;
  camera_id: number;
  user_id: number;
  camera: Camera;
}
