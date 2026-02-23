# Release Notes Implementation

## Overview
This implementation adds support for extracting and displaying GitHub release notes in Home Assistant when MqDockerUp detects container updates.

## Changes Made

### 1. Updated ImageRegistryAdapter Interface
**File:** `src/registry-factory/ImageRegistryAdapter.ts`
- Modified the `checkForNewDigest()` method signature to return an optional `releaseNotes` field
- Return type changed from `Promise<{ newDigest: string; }>` to `Promise<{ newDigest: string; releaseNotes?: string; }>`

### 2. Enhanced GithubAdapter
**File:** `src/registry-factory/GithubAdapter.ts`
- Added logic to fetch release notes from GitHub API (`https://api.github.com/repos/{user}/{repo}/releases/latest`)
- Extracts the `body` field from the latest release
- Gracefully handles errors if release notes cannot be fetched (logs warning but doesn't fail)
- Uses the existing GitHub access token for authentication

### 3. Updated Other Adapters
**Files:** 
- `src/registry-factory/DockerhubAdapter.ts`
- `src/registry-factory/LscrAdapter.ts`

Updated return type signatures to match the new interface (no release notes extraction for these registries yet)

### 4. Added DockerService Method
**File:** `src/services/DockerService.ts`
- Added new method `getImageNewDigestWithReleaseNotes()` that returns both digest and release notes
- Maintains backward compatibility with existing `getImageNewDigest()` method

### 5. Updated HomeAssistant Service
**File:** `src/services/HomeassistantService.ts`
- Modified `publishImageUpdateMessage()` to fetch and include release notes
- For legacy mode: Sets `release_notes` field in the payload
- For standard mode: Sets `release_summary` field in the payload
- Release notes are displayed when clicking on the update entity in Home Assistant

## How It Works

1. When MqDockerUp checks for updates to a GitHub Container Registry (ghcr.io) image:
   - It fetches the latest digest from the container registry
   - It simultaneously fetches the latest release information from the GitHub API
   - The release notes from the `body` field are extracted

2. When an update is detected:
   - The update entity (e.g., `update.ghcr_io_cleanuparr_cleanuparr_update`) changes from `off` to `on`
   - The release notes are included in the MQTT payload

3. In Home Assistant:
   - When you click on the update entity, the release notes are displayed
   - The notes appear in the entity details/attributes

## Example API Response
```json
{
  "tag_name": "v1.2.3",
  "name": "Release v1.2.3",
  "body": "## What's Changed\n\n* Feature: Added new functionality\n* Fix: Resolved bug #123\n\n**Full Changelog**: https://github.com/user/repo/compare/v1.2.2...v1.2.3"
}
```

## Configuration Requirements

- GitHub access token must be configured in `config.yaml`:
  ```yaml
  accessTokens:
    github: "your_github_token_here"
  ```

## Compatibility

- Works with GitHub Container Registry (ghcr.io) images
- Requires the container image to have a corresponding GitHub repository with releases
- Falls back gracefully if release notes cannot be fetched
- Maintains backward compatibility with existing functionality

## Testing

To test the implementation:
1. Ensure you have a GitHub access token configured
2. Monitor a container from ghcr.io that has GitHub releases
3. When an update is detected, check the Home Assistant update entity
4. The release notes should appear in the entity details

## Future Enhancements

Potential improvements:
- Add release notes support for Docker Hub (if available via their API)
- Cache release notes to reduce API calls
- Support for release notes from other registries
- Markdown rendering in Home Assistant
