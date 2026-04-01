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
- **Authentication**: Optional API key via `X-Api-Key` header
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

## Configuration Options (Future Enhancement)

In a future update, you'll be able to configure application API settings in `config.yaml`:

```yaml
# Future configuration example
applicationApis:
  radarr:
    enabled: true
    apiKey: "your-api-key-here"  # Optional
    baseUrl: "http://radarr:7878"  # Optional, auto-detected by default
  sonarr:
    enabled: true
    apiKey: "your-api-key-here"
    baseUrl: "http://sonarr:8989"
```

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

If you see `Radarr API authentication failed`, the application requires an API key. This will be configurable in a future update.

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
