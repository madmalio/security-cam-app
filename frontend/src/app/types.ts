export interface Camera {
  id: number;
  name: string;
  path: string;
  rtsp_url: string;
}

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  gravatar_hash: string | null;
}
