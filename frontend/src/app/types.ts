export interface Camera {
  id: number;
  name: string;
  path: string;
  rtsp_url: string;
  display_order: number;
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
