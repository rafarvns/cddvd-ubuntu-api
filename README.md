# BurnStation 💿 (CD/DVD Burning API)

A robust, secure, and modular Node.js/TypeScript API designed to control optical drives on Ubuntu Linux systems. It is specifically optimized for burning PS1 (.bin/.cue) and PS2 (.iso) game images.

## 🚀 Features

- **Integrated Frontend**: Modern, dark-mode dashboard for managing burning jobs.
- **Queue Management**: FIFO job queue ensures only one burning process runs at a time.
- **Real-time Monitoring**: Progress tracking and live logs served via API and UI.
- **Hardware Control**: Remote eject capability.
- **Media Support**: Automatically detects and handles PS1 (via `cdrdao`) and PS2 (via `wodim`) recording requirements.
- **Standalone Binary**: Can be packaged into a single executable for easy distribution on Linux.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, TypeScript.
- **Frontend**: Vanilla HTML5, CSS3 (Modern Industrial Aesthetic), JavaScript.
- **Tools**: `wodim`, `cdrdao` (for Linux hardware interaction).
- **Logging**: Pino.

## ⚙️ Configuration

The application is configured via environment variables or a `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Listening port for the API and Frontend | `48271` |
| `ISOS_DIR` | Directory where .iso and .cue files are stored | `/home/rafarvns/isos` |
| `DRIVE_DEVICE` | Path to the optical drive device | `/dev/sr0` |

## 📦 Getting Started

### Prerequisites
- Node.js 18+
- Linux system with burning tools installed:
  ```bash
  sudo apt update
  sudo apt install wodim cdrdao
  ```

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Start the server in development mode with auto-reload:
```bash
npm run dev
```
Access the dashboard at `http://localhost:48271`.

### Build
Compile TypeScript to JavaScript:
```bash
npm run build
```

Generate a standalone Linux binary:
```bash
npm run build:exe
```
The output will be in the `./bin` directory.

## 📖 API Documentation
The API follows the OpenAPI 3.0 specification. You can find the full spec in `docs/openapi.yaml`.

### Key Endpoints:
- `GET /files`: List available media.
- `POST /burn`: Start a burning job.
- `GET /burn/:id`: Check status and logs.
- `POST /drive/eject`: Eject the drive tray.

## 🎨 Design Philosophy
The frontend follows a **"BurnStation"** aesthetic—dark, industrial, and high-tech, focusing on clarity during the high-stakes process of optical media recording.

## ⚖️ License
ISC
