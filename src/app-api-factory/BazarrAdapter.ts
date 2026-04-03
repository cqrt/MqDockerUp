import { ApplicationApiAdapter, AppUpdateInfo } from './ApplicationApiAdapter';
import logger from '../services/LoggerService';

interface BazarrRelease {
    body: string;
    name: string;
    date: string;
    prerelease: boolean;
    current?: boolean;
}

// Bazarr API wraps responses in a data envelope
interface BazarrApiResponse {
    data: BazarrRelease[];
}

export class BazarrAdapter extends ApplicationApiAdapter {
    static get displayName(): string {
        return 'Bazarr';
    }

    static canHandle(containerName: string, image: string): boolean {
        const lowerName = containerName.toLowerCase();
        const lowerImage = image.toLowerCase();
        
        return lowerName.includes('bazarr') || lowerImage.includes('bazarr');
    }

    protected getApiUrl(): string {
        let url: string;
        if (this.baseUrl) {
            url = `${this.baseUrl}/api/system/releases`;
        } else {
            // Default to localhost with common Bazarr port
            url = `http://${this.containerName}:6767/api/system/releases`;
        }
        
        return url;
    }

    /**
     * Build request headers for Bazarr API.
     * Modern Bazarr uses X-API-KEY header for authentication.
     */
    protected getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.apiKey) {
            headers['X-API-KEY'] = this.apiKey;
        }
        return headers;
    }

    protected formatReleaseNotes(releases: BazarrRelease[]): string {
        if (!releases || releases.length === 0) {
            return '';
        }

        // Get the latest non-prerelease or the first release
        const latestRelease = releases.find(r => !r.prerelease) || releases[0];
        
        let notes = `## ${latestRelease.name}\n`;
        notes += `**Release Date:** ${new Date(latestRelease.date).toLocaleDateString()}\n\n`;
        
        // Bazarr provides release notes in the body field
        if (latestRelease.body) {
            notes += latestRelease.body;
        }

        return notes.trim();
    }

    async fetchUpdateInfo(): Promise<AppUpdateInfo | null> {
        try {
            const url = this.getApiUrl();
            logger.debug(`Fetching Bazarr releases from: ${url}`);
            
            const headers = this.getHeaders();
            const response = await this.http.get<BazarrApiResponse | BazarrRelease[]>(url, { headers });
            
            // Bazarr API wraps responses in a { data: [...] } envelope.
            // Handle both formats for resilience.
            const releases: BazarrRelease[] = Array.isArray(response.data)
                ? response.data
                : (response.data as BazarrApiResponse)?.data || [];
            
            if (!releases || releases.length === 0) {
                logger.warn(`No release information available for Bazarr container: ${this.containerName}`);
                return null;
            }

            const latestRelease = releases.find(r => !r.prerelease) || releases[0];
            const releaseNotes = this.formatReleaseNotes(releases);

            logger.info(`Successfully fetched Bazarr release info for ${this.containerName}`);

            return {
                version: latestRelease.name,
                releaseNotes: releaseNotes,
                releaseDate: latestRelease.date,
                changes: [] // Bazarr doesn't separate changes into categories
            };
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                logger.debug(`Could not connect to Bazarr API for ${this.containerName}: ${error.message}`);
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                logger.warn(`Bazarr API authentication failed for ${this.containerName}. API key may be required.`);
            } else {
                logger.debug(`Failed to fetch Bazarr release info for ${this.containerName}: ${error.message}`);
            }
            return null;
        }
    }
}
