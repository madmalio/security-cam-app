📸 CamView - A Modern Web-Based Security Camera Viewer

CamView is a self-hosted, full-stack security camera web application built with a modern tech stack. It uses mediamtx to handle RTSP streams from your IP cameras and securely broadcasts them to a responsive Next.js frontend using high-performance WebRTC (WHEP). The backend is a secure, token-based FastAPI server with full user authentication and database persistence.

✨ Features

Secure Authentication: Full user registration and login system using JWT (short-lived access tokens and long-lived refresh tokens) [cite: main.py, AuthContext.tsx].

Token-Based Streaming: WebRTC streams are secured. Client must fetch credentials from the authenticated API, preventing unauthorized stream access [cite: main.py, LiveCameraView.tsx].

Full Camera Management (CRUD): Easily add, edit, test, reorder, and delete your camera streams [cite: Project Context, main.py].

Dynamic Dashboard Views:

Grid View: See all your cameras at a glance [cite: Project Context, CameraGridView.tsx].

Focus View: A "1 + 5" layout with a main focused camera and a sidebar of other streams [cite: Project Context, FocusView.tsx].

Fullscreen Modes:

Fullscreen Grid: A dedicated, scrollable grid of all cameras [cite: Project Context, FullscreenGridView.tsx].

Fullscreen Mosaic: An auto-cycling "1 + 5" mosaic view, perfect for a dedicated monitor [cite: Project Context, MosaicView.tsx].

Comprehensive Settings Page:

Profile: Update your display name (with Gravatar support) [cite: ProfileSettings.tsx].

Security: Change your password, view and revoke all active login sessions, and delete your account [cite: SecuritySettings.tsx].

Camera Management: A drag-and-drop interface to reorder cameras [cite: CameraSettings.tsx].

Appearance: Persistent light/dark/system theme switcher and customizable dashboard preferences (default view, grid columns) [cite: AppearanceSettings.tsx].

Hardened & Optimized: The entire application is containerized with a security-first approach, using non-root users, read-only filesystems, and Docker Secrets [cite: docker-compose.yml, frontend/Dockerfile, backend/Dockerfile].

🛠️ Tech Stack

Frontend: Next.js (React / TypeScript), Tailwind CSS, sonner (toasts), lucide-react (icons)

Backend: FastAPI (Python), SQLAlchemy (ORM), passlib & python-jose (JWT auth)

Database: PostgreSQL

Media Server: mediamtx (RTSP to WebRTC/WHEP)

Containerization: Docker & Docker Compose

🚀 Getting Started

Follow these instructions to build and run the entire application stack locally.

1. Prerequisites

Docker and Docker Compose installed.

Git installed.

Your own RTSP-capable IP cameras.

2. Clone the Repository

git clone [https://github.com/your-username/CamView.git](https://github.com/your-username/CamView.git)
cd CamView

3. Configure Secrets

This project uses Docker Secrets to keep your passwords secure. You must create the following files in the root directory:

db_password.txt

Create this file and add only the password you want for your database.

Example: supersecretpassword

secret_key.txt

Create this file and add a long, random string to use for signing JWTs.

Example: oVlxx1WjIyVNfsr2WWROPcsVyBhW5L7u

db_url.txt

Create this file with the full connection string the backend will use to connect to the database. Use the password you created in db_password.txt.

Example: postgresql://admin:supersecretpassword@db/cameradb

Important: Add these files to your .gitignore to prevent committing them to source control.

# Example commands

echo "supersecretpassword" > db_password.txt
echo "oVlxx1WjIyVNfsr2WWROPcsVyBhW5L7u" > secret_key.txt
echo "postgresql://admin:supersecretpassword@db/cameradb" > db_url.txt

# Add to .gitignore

echo "\*.txt" >> .gitignore

4. Configure mediamtx

Review the mediamtx.yml file [cite: mediamtx.yml]. The default configuration is ready to use, but you should be aware of two users:

admin:mysecretpassword: This user is used by your backend (main.py) to add and remove camera paths from mediamtx. If you change this password, you must also change it in backend/main.py.

viewer:secret: This user is used by the frontend to view the WebRTC streams. The credentials for this user are securely sent from the backend (/api/webrtc-creds) [cite: main.py]. If you change this password, you must also change it in backend/main.py.

5. Build and Run

With your secret files in place, you can build and run the entire application with a single command:

docker-compose up -d --build

6. Access Your App

CamView Frontend: Open http://localhost:3001 in your browser.

mediamtx (Internal): The mediamtx admin API is no longer exposed to the internet for security. It is only accessible to the backend service.

You can now register your first user and start adding cameras!

📂 Project Structure

.
├── backend/
│ ├── Dockerfile # Python container
│ ├── main.py # FastAPI app
│ ├── models.py # SQLAlchemy models
│ ├── database.py # Database connection
│ └── requirements.txt
├── frontend/
│ ├── Dockerfile # Next.js container
│ ├── src/app/ # App routes and components
│ └── package.json
├── docker-compose.yml # Main orchestration file
├── mediamtx.yml # Media server configuration
├── db_password.txt # (Secret, gitignored)
├── db_url.txt # (Secret, gitignored)
└── secret_key.txt # (Secret, gitignored)

⚖️ License

This project is licensed under the MIT License.
