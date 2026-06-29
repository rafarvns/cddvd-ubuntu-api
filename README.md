# BurnStation 💿 (CD/DVD Burning API)

A robust, secure, and modular Node.js/TypeScript API designed to control optical drives on Ubuntu Linux systems. It is specifically optimized for burning PS1 (.bin/.cue) and PS2 (.iso) game images.

## 🚀 Features

- **Integrated Frontend**: Modern, dark-mode dashboard for managing burning jobs.
- **Queue Management**: FIFO job queue ensures only one burning process runs at a time.
- **Real-time Monitoring**: Progress tracking and live logs served via API and UI.
- **Hardware Control**: Remote eject capability.
- **Media Support**: Automatically detects and handles PS1 (CD via `cdrdao`) and PS2 (DVD via `growisofs`, burned `-dvd-compat`/closed so the console accepts the disc).
- **Standalone Binary**: Can be packaged into a single executable for easy distribution on Linux.
- **Docker Ready**: Pre-configured Docker and Docker Compose support for easy deployment.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, TypeScript.
- **Frontend**: Vanilla HTML5, CSS3 (Modern Industrial Aesthetic), JavaScript.
- **Tools**: `cdrdao`, `growisofs` (dvd+rw-tools), `wodim` (for Linux hardware interaction).
- **Logging**: Pino.

## 🐳 Docker (Recommended)

The easiest way to run BurnStation is using Docker. It handles all native dependencies (`cdrdao`, `growisofs`, `wodim`) and hardware permissions automatically.

### Run with Docker Compose
```bash
docker-compose up --build -d
```
Access the dashboard at `http://localhost:48271`.

> [!IMPORTANT]
> Change the volume mapping in `docker-compose.yml` to point to your ISO directory if it's not `/home/rafarvns/isos`.

## ⚙️ Configuration

The application is configured via environment variables or a `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Listening port for the API and Frontend | `48271` |
| `ISOS_DIR` | Directory where .iso and .cue files are stored | `/home/rafarvns/isos` |
| `DRIVE_DEVICE` | Path to the optical drive device | `/dev/sr0` |

## 🖥️ Native Installation (Ubuntu)

### Prerequisites
- Node.js 18+
- Linux system with burning tools: `sudo apt install wodim cdrdao dvd+rw-tools`

### Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   npm run build
   ```

### 🛠️ Systemd Service Management
You can install the API as a background system service:

**Install:**
```bash
sudo bash scripts/install-service.sh
```

**Uninstall:**
```bash
sudo bash scripts/uninstall-service.sh
```

## 📖 API Documentation
The API follows the OpenAPI 3.0 specification. You can find the full spec in `docs/openapi.yaml`.

### Key Endpoints:
- `GET /api/files`: List available media.
- `POST /api/burn`: Start a burning job.
- `GET /api/burn/:id`: Check status and logs.
- `POST /api/drive/eject`: Eject the drive tray.

## ⚖️ License
ISC

