# 📸 CamView - A Modern Web-Based Security Camera Viewer

CamView is a self-hosted, full-stack security camera web application built with a modern tech stack. It uses `mediamtx` to handle RTSP streams from your IP cameras and securely broadcasts them to a responsive Next.js frontend using high-performance WebRTC (WHEP). The backend is a secure, token-based FastAPI server with full user authentication and database persistence.

## ✨ Features

- **Secure Authentication:** Full user registration and login system using JWT (short-lived access tokens and long-lived refresh tokens).
- **Token-Based Streaming:** WebRTC streams are secured. Client must fetch credentials from the authenticated API, preventing unauthorized stream access.
- **Full Camera Management (CRUD):** Easily add, edit, test, reorder, and delete your camera streams.
- **Dynamic Dashboard Views:**
  - **Grid View:** See all your cameras at a glance.
  - **Focus View:** A "1 + 5" layout with a main focused camera and a sidebar of other streams.
- **Fullscreen Modes:**
  - **Fullscreen Grid:** A dedicated, scrollable grid of all cameras.
  - **Fullscreen Mosaic:** An auto-cycling "1 + 5" mosaic view, perfect for a dedicated monitor.
- **Comprehensive Settings Page:**
  - **Profile:** Update your display name (with Gravatar support).
  - **Security:** Change your password, view and revoke all active login sessions, and delete your account.
  - **Camera Management:** A drag-and-drop interface to reorder cameras.
  - **Appearance:** Persistent light/dark/system theme switcher and customizable dashboard preferences (default view, grid columns).
- **Hardened & Optimized:** The entire application is containerized with a security-first approach, using non-root users, read-only filesystems, and Docker Secrets.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js (React / TypeScript), Tailwind CSS, `sonner` (toasts), `lucide-react` (icons)
- **Backend:** FastAPI (Python), SQLAlchemy (ORM), `passlib` & `python-jose` (JWT auth)
- **Database:** PostgreSQL
- **Media Server:** `mediamtx` (RTSP to WebRTC/WHEP)
- **Containerization:** Docker & Docker Compose

---

## 🚀 Getting Started

Follow these instructions to build and run the entire application stack locally.

### 1. Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) and [Docker Compose](https://docs.docker.com/compose/) installed.
- [Git](https://git-scm.com/) installed.
- Your own RTSP-capable IP cameras.

### 2. Clone the Repository

```bash
git clone [https://github.com/your-username/CamView.git](https://github.com/your-username/CamView.git)
cd CamView
```
