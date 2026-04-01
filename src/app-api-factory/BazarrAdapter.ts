import { ApplicationApiAdapter, AppUpdateInfo } from './ApplicationApiAdapter';
import logger from '../services/LoggerService';

interface BazarrRelease {
    body: string;
    name: string;
    date: string;
    prerelease: boolean;
    current?: boolean;
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
        if (this.baseUrl) {
            return `${this.baseUrl}/api/system/releases`;
        }
        
        // Default to localhost with common Bazarr port
        return `http://${this.containerName}:6767/api/system/releases`;
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
            const headers: any = {};
            
            if (this.apiKey) {
                headers['X-API-KEY'] = this.apiKey;
            }

            logger.debug(`Fetching Bazarr releases from: ${url}`);
            
            const response = await this.http.get<BazarrRelease[]>(url, { headers });
            
            if (!response.data || response.data.length === 0) {
                logger.warn(`No release information available for Bazarr container: ${this.containerName}`);
                return null;
            }

            const latestRelease = response.data.find(r => !r.prerelease) || response.data[0];
            const releaseNotes = this.formatReleaseNotes(response.data);

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
