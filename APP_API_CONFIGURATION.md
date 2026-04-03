# Application API Configuration

This document explains how to configure MqDockerUp to fetch release notes directly from application APIs for containers that don't provide release notes through their container registry.

## Overview

MqDockerUp now supports fetching release notes from application-specific APIs as a fallback when registry-based release notes aren't available. This is particularly useful for:
- Docker Hub images (e.g., LinuxServer.io containers)
- Applications with their own update APIs (Radarr, Sonarr, Prowlarr, etc.)

## How It Works

1. **Primary Source**: MqDockerUp first tries to get release notes from the container registry (GitHub for ghcr.io images)
2. **Fallback Source**: If no release notes are found, it attempts to fetch them from the application's API
3. **Automatic Detection**: The system automatically detects supported applications based on container name and image

## Supported Applications

### Radarr
- **Detection**: Container name or image contains "radarr"
- **API Endpoint**: `http://{container-name}:7878/api/v3/update`
- **Default Port**: 7878
- **Authentication**: API key via `X-Api-Key` header
- **Release Notes Format**: Includes version, release date, new features, and bug fixes

### Sonarr
- **Detection**: Container name or image contains "sonarr"
- **API Endpoint**: `http://{container-name}:8989/api/v3/update`
- **Default Port**: 8989
- **Authentication**: API key via `X-Api-Key` header
- **Release Notes Format**: Includes version, release date, new features, and bug fixes

### Lidarr
- **Detection**: Container name or image contains "lidarr"
- **API Endpoint**: `http://{container-name}:8686/api/v1/update`
- **Default Port**: 8686
- **Authentication**: API key via `X-Api-Key` header
- **Release Notes Format**: Includes version, release date, new features, and bug fixes

### Readarr
- **Detection**: Container name or image contains "readarr"
- **API Endpoint**: `http://{container-name}:8787/api/v1/update`
- **Default Port**: 8787
- **Authentication**: API key via `X-Api-Key` header
- **Release Notes Format**: Includes version, release date, new features, and bug fixes

## Network Requirements

For application API adapters to work, MqDockerUp needs:

1. **Network Access**: Ability to reach the application's port
2. **Same Docker Network**: MqDockerUp should be on the same Docker network as the applications
3. **DNS Resolution**: Container names must be resolvable (automatic in Docker networks)

### Example Docker Compose Configuration

```yaml
version: '3.8'

services:
  mqdockerup:
    image: ghcr.io/cqrt/mqdockerup:latest
    container_name: mqdockerup
    networks:
      - media_network  # Same network as your applications
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config.yaml:/app/config.yaml
    environment:
      - TZ=Pacific/Auckland

  radarr:
    image: lscr.io/linuxserver/radarr:latest
    container_name: radarr
    networks:
      - media_network  # Same network as MqDockerUp
    ports:
      - "7878:7878"
    # ... other configuration

networks:
  media_network:
    driver: bridge
```

## Configuration

API keys can be configured either via `config.yaml` or via environment variables (recommended for Docker Compose deployments).

### Option 1: Environment Variables (Recommended)

Set API keys directly in your `docker-compose.yml` using the format `APPLICATIONAPIS_<APP>_<KEY>`:

```yaml
services:
  mqdockerup:
    image: cqrt/mqdockerup
    environment:
      - MQTT_CONNECTIONURI=mqtt://broker:1883
      # Application API keys
      - APPLICATIONAPIS_RADARR_APIKEY=your-radarr-api-key
      - APPLICATIONAPIS_SONARR_APIKEY=your-sonarr-api-key
      - APPLICATIONAPIS_LIDARR_APIKEY=your-lidarr-api-key
      - APPLICATIONAPIS_READARR_APIKEY=your-readarr-api-key
      - APPLICATIONAPIS_PROWLARR_APIKEY=your-prowlarr-api-key
      - APPLICATIONAPIS_BAZARR_APIKEY=your-bazarr-api-key
      # Optional: override base URLs
      - APPLICATIONAPIS_RADARR_BASEURL=http://radarr:7878
      # Optional: disable specific adapters
      - APPLICATIONAPIS_BAZARR_ENABLED=false
```

Available environment variables per application:

| Variable | Description |
|---|---|
| `APPLICATIONAPIS_<APP>_ENABLED` | Enable/disable the adapter (`true`/`false`) |
| `APPLICATIONAPIS_<APP>_APIKEY` | API key for authentication |
| `APPLICATIONAPIS_<APP>_BASEURL` | Override the auto-detected base URL |

Where `<APP>` is one of: `RADARR`, `SONARR`, `LIDARR`, `READARR`, `PROWLARR`, `BAZARR`.

Environment variables take precedence over values in `config.yaml`.

### Option 2: config.yaml

```yaml
applicationApis:
  radarr:
    enabled: true
    apiKey: "your-radarr-api-key"
    # baseUrl: "http://radarr:7878"  # Optional override
  sonarr:
    enabled: true
    apiKey: "your-sonarr-api-key"
    # baseUrl: "http://sonarr:8989"
  lidarr:
    enabled: true
    apiKey: "your-lidarr-api-key"
    # baseUrl: "http://lidarr:8686"
  readarr:
    enabled: true
    apiKey: "your-readarr-api-key"
    # baseUrl: "http://readarr:8787"
  prowlarr:
    enabled: true
    apiKey: "your-prowlarr-api-key"
    # baseUrl: "http://prowlarr:9696"
  bazarr:
    enabled: true
    apiKey: "your-bazarr-api-key"
    # baseUrl: "http://bazarr:6767"
```

> **Note:** Avoid committing API keys to version control. Prefer environment variables or use a `.env` file with your Docker Compose setup.

### Getting API Keys

For each *arr application:
1. Open the application's web interface
2. Go to **Settings** -> **General** -> **Security**
3. Copy the **API Key**
4. Add it to your Docker Compose environment or `config.yaml`

## Current Behavior

Currently, the application API adapters:
- **Auto-detect** applications based on container name/image
- **Use default ports** (e.g., 7878 for Radarr)
- **Use container name** for DNS resolution
- **Work without API keys** if the application allows unauthenticated access to update endpoints
- **Fail gracefully** if the application is unreachable or requires authentication

## Troubleshooting

### No Release Notes Appearing

1. **Check Network Connectivity**:
   ```bash
   docker exec mqdockerup ping radarr
   ```

2. **Verify Application is Accessible**:
   ```bash
   docker exec mqdockerup curl http://radarr:7878/api/v3/update
   ```

3. **Check Logs**:
   Look for messages like:
   - `Using Radarr adapter for container: radarr`
   - `Successfully fetched Radarr update info`
   - `Could not connect to Radarr API`

### API Authentication Required

If you see `Radarr API authentication failed`, the application requires an API key.

## Adding More Applications

The architecture is designed to be extensible. To add support for more applications:

1. Create a new adapter in `src/app-api-factory/` (e.g., `SonarrAdapter.ts`)
2. Extend `ApplicationApiAdapter` class
3. Implement the required methods
4. Register in `ApplicationApiAdapterFactory.ts`

## Release Notes Priority

Release notes are fetched in this order:
1. **GitHub Container Registry** (ghcr.io) - Direct from GitHub releases
2. **Application API** - From the application's own update endpoint
3. **None** - If neither source is available

## Benefits

- ✅ Get release notes for LinuxServer.io containers
- ✅ No additional configuration required (auto-detection)
- ✅ Graceful fallback if application is unreachable
- ✅ Works alongside existing GitHub release notes
- ✅ Clean, organized architecture for future expansion
