import { BazarrAdapter } from '../src/app-api-factory/BazarrAdapter';

// Mock axios so no real HTTP calls are made
jest.mock('axios');

describe('BazarrAdapter', () => {
    describe('canHandle', () => {
        it('should match container names containing bazarr', () => {
            expect(BazarrAdapter.canHandle('bazarr', 'lscr.io/linuxserver/bazarr')).toBe(true);
            expect(BazarrAdapter.canHandle('my-bazarr', 'some-image')).toBe(true);
            expect(BazarrAdapter.canHandle('BAZARR', 'some-image')).toBe(true);
        });

        it('should match image names containing bazarr', () => {
            expect(BazarrAdapter.canHandle('some-container', 'lscr.io/linuxserver/bazarr')).toBe(true);
            expect(BazarrAdapter.canHandle('some-container', 'hotio/bazarr')).toBe(true);
        });

        it('should not match unrelated containers', () => {
            expect(BazarrAdapter.canHandle('radarr', 'lscr.io/linuxserver/radarr')).toBe(false);
            expect(BazarrAdapter.canHandle('sonarr', 'lscr.io/linuxserver/sonarr')).toBe(false);
            expect(BazarrAdapter.canHandle('plex', 'plexinc/pms-docker')).toBe(false);
        });

        it('should have correct display name', () => {
            expect(BazarrAdapter.displayName).toBe('Bazarr');
        });
    });

    describe('getApiUrl', () => {
        it('should use baseUrl when provided', () => {
            const adapter = new BazarrAdapter('bazarr', 'test-key', 'http://bazarr:6767');
            const url = adapter['getApiUrl']();
            expect(url).toBe('http://bazarr:6767/api/system/releases');
        });

        it('should fall back to container name with default port', () => {
            const adapter = new BazarrAdapter('bazarr', 'test-key');
            const url = adapter['getApiUrl']();
            expect(url).toBe('http://bazarr:6767/api/system/releases');
        });

        it('should not include apikey in the URL', () => {
            const adapter = new BazarrAdapter('bazarr', 'secret-key');
            const url = adapter['getApiUrl']();
            expect(url).not.toContain('apikey');
        });
    });

    describe('getHeaders', () => {
        it('should include X-API-KEY header when apiKey is provided', () => {
            const adapter = new BazarrAdapter('bazarr', 'test-key');
            const headers = adapter['getHeaders']();
            expect(headers['X-API-KEY']).toBe('test-key');
        });

        it('should return empty headers when no apiKey', () => {
            const adapter = new BazarrAdapter('bazarr');
            const headers = adapter['getHeaders']();
            expect(headers['X-API-KEY']).toBeUndefined();
            expect(Object.keys(headers)).toHaveLength(0);
        });
    });

    describe('formatReleaseNotes', () => {
        it('should format release notes correctly', () => {
            const adapter = new BazarrAdapter('bazarr');
            const releases = [
                {
                    body: 'Fixed subtitle syncing\nAdded new provider',
                    name: 'v1.4.0',
                    date: '2024-01-15T10:30:00Z',
                    prerelease: false,
                    current: true
                }
            ];

            const notes = adapter['formatReleaseNotes'](releases);
            expect(notes).toContain('## v1.4.0');
            expect(notes).toContain('Fixed subtitle syncing');
            expect(notes).toContain('Added new provider');
        });

        it('should skip prereleases and use stable release', () => {
            const adapter = new BazarrAdapter('bazarr');
            const releases = [
                {
                    body: 'Beta features',
                    name: 'v1.5.0-beta',
                    date: '2024-02-01T00:00:00Z',
                    prerelease: true,
                },
                {
                    body: 'Stable release notes',
                    name: 'v1.4.0',
                    date: '2024-01-15T10:30:00Z',
                    prerelease: false,
                }
            ];

            const notes = adapter['formatReleaseNotes'](releases);
            expect(notes).toContain('## v1.4.0');
            expect(notes).toContain('Stable release notes');
            expect(notes).not.toContain('Beta features');
        });

        it('should return empty string for empty array', () => {
            const adapter = new BazarrAdapter('bazarr');
            expect(adapter['formatReleaseNotes']([])).toBe('');
        });

        it('should return empty string for null/undefined', () => {
            const adapter = new BazarrAdapter('bazarr');
            expect(adapter['formatReleaseNotes'](null as any)).toBe('');
            expect(adapter['formatReleaseNotes'](undefined as any)).toBe('');
        });
    });

    describe('fetchUpdateInfo', () => {
        it('should handle data envelope response format', async () => {
            const adapter = new BazarrAdapter('bazarr', 'test-key');

            // Mock the http.get to return Bazarr's envelope format
            const mockResponse = {
                data: {
                    data: [
                        {
                            body: 'Fixed subtitle syncing',
                            name: 'v1.4.0',
                            date: '2024-01-15T10:30:00Z',
                            prerelease: false,
                            current: true
                        }
                    ]
                }
            };
            adapter['http'].get = jest.fn().mockResolvedValue(mockResponse);

            const result = await adapter.fetchUpdateInfo();
            expect(result).not.toBeNull();
            expect(result?.version).toBe('v1.4.0');
            expect(result?.releaseNotes).toContain('v1.4.0');
            expect(result?.releaseNotes).toContain('Fixed subtitle syncing');
        });

        it('should handle direct array response format', async () => {
            const adapter = new BazarrAdapter('bazarr', 'test-key');

            // Mock direct array format (for compatibility)
            const mockResponse = {
                data: [
                    {
                        body: 'Direct array notes',
                        name: 'v1.3.0',
                        date: '2024-01-10T00:00:00Z',
                        prerelease: false,
                    }
                ]
            };
            adapter['http'].get = jest.fn().mockResolvedValue(mockResponse);

            const result = await adapter.fetchUpdateInfo();
            expect(result).not.toBeNull();
            expect(result?.version).toBe('v1.3.0');
            expect(result?.releaseNotes).toContain('Direct array notes');
        });

        it('should return null when no releases available (envelope)', async () => {
            const adapter = new BazarrAdapter('bazarr', 'test-key');

            const mockResponse = { data: { data: [] } };
            adapter['http'].get = jest.fn().mockResolvedValue(mockResponse);

            const result = await adapter.fetchUpdateInfo();
            expect(result).toBeNull();
        });

        it('should return null when no releases available (direct)', async () => {
            const adapter = new BazarrAdapter('bazarr', 'test-key');

            const mockResponse = { data: [] };
            adapter['http'].get = jest.fn().mockResolvedValue(mockResponse);

            const result = await adapter.fetchUpdateInfo();
            expect(result).toBeNull();
        });

        it('should return null on connection error', async () => {
            const adapter = new BazarrAdapter('bazarr', 'test-key');

            const error = new Error('Connection refused');
            (error as any).code = 'ECONNREFUSED';
            adapter['http'].get = jest.fn().mockRejectedValue(error);

            const result = await adapter.fetchUpdateInfo();
            expect(result).toBeNull();
        });

        it('should return null on auth failure', async () => {
            const adapter = new BazarrAdapter('bazarr', 'bad-key');

            const error = new Error('Unauthorized');
            (error as any).response = { status: 401 };
            adapter['http'].get = jest.fn().mockRejectedValue(error);

            const result = await adapter.fetchUpdateInfo();
            expect(result).toBeNull();
        });

        it('should return null on 403 forbidden', async () => {
            const adapter = new BazarrAdapter('bazarr', 'bad-key');

            const error = new Error('Forbidden');
            (error as any).response = { status: 403 };
            adapter['http'].get = jest.fn().mockRejectedValue(error);

            const result = await adapter.fetchUpdateInfo();
            expect(result).toBeNull();
        });

        it('should pass X-API-KEY header in request', async () => {
            const adapter = new BazarrAdapter('bazarr', 'my-api-key');

            const mockGet = jest.fn().mockResolvedValue({ data: { data: [] } });
            adapter['http'].get = mockGet;

            await adapter.fetchUpdateInfo();

            expect(mockGet).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-API-KEY': 'my-api-key'
                    })
                })
            );
        });
    });
});
