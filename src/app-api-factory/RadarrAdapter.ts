import { ApplicationApiAdapter, AppUpdateInfo } from './ApplicationApiAdapter';
import logger from '../services/LoggerService';

interface RadarrUpdate {
    version: string;
    branch: string;
    releaseDate: string;
    fileName: string;
    url: string;
    installed: boolean;
    installable: boolean;
    latest: boolean;
    changes: {
        fixed?: string[];
        new?: string[];
    };
}

export class RadarrAdapter extends ApplicationApiAdapter {
    static get displayName(): string {
        return 'Radarr';
    }

    static canHandle(containerName: string, image: string): boolean {
        const lowerName = containerName.toLowerCase();
        const lowerImage = image.toLowerCase();
        
        return lowerName.includes('radarr') || lowerImage.includes('radarr');
    }

    protected getApiUrl(): string {
        // Try to construct URL from base URL or use container name
        if (this.baseUrl) {
            return `${this.baseUrl}/api/v3/update`;
        }
        
        // Default to localhost with common Radarr port
        return `http://${this.containerName}:7878/api/v3/update`;
    }

    protected formatReleaseNotes(updates: RadarrUpdate[]): string {
        if (!updates || updates.length === 0) {
            return '';
        }

        // Get the latest update
        const latestUpdate = updates.find(u => u.latest) || updates[0];
        
        let notes = `## ${latestUpdate.version}\n`;
        notes += `**Release Date:** ${new Date(latestUpdate.releaseDate).toLocaleDateString()}\n\n`;

        if (latestUpdate.changes) {
            if (latestUpdate.changes.new && latestUpdate.changes.new.length > 0) {
                notes += `### New Features\n`;
                latestUpdate.changes.new.forEach(change => {
                    notes += `- ${change}\n`;
                });
                notes += '\n';
            }

            if (latestUpdate.changes.fixed && latestUpdate.changes.fixed.length > 0) {
                notes += `### Bug Fixes\n`;
                latestUpdate.changes.fixed.forEach(change => {
                    notes += `- ${change}\n`;
                });
            }
        }

        return notes.trim();
    }

    async fetchUpdateInfo(): Promise<AppUpdateInfo | null> {
        try {
            const url = this.getApiUrl();
            const headers: any = {};
            
            if (this.apiKey) {
                headers['X-Api-Key'] = this.apiKey;
            }

            logger.debug(`Fetching Radarr updates from: ${url}`);
            
            const response = await this.http.get<RadarrUpdate[]>(url, { headers });
            
            if (!response.data || response.data.length === 0) {
                logger.warn(`No update information available for Radarr container: ${this.containerName}`);
                return null;
            }

            const latestUpdate = response.data.find(u => u.latest) || response.data[0];
            const releaseNotes = this.formatReleaseNotes(response.data);

            logger.info(`Successfully fetched Radarr update info for ${this.containerName}`);

            return {
                version: latestUpdate.version,
                releaseNotes: releaseNotes,
                releaseDate: latestUpdate.releaseDate,
                changes: [
                    ...(latestUpdate.changes?.new || []),
                    ...(latestUpdate.changes?.fixed || [])
                ]
            };
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                logger.debug(`Could not connect to Radarr API for ${this.containerName}: ${error.message}`);
            } else if (error.response?.status === 401) {
                logger.warn(`Radarr API authentication failed for ${this.containerName}. API key may be required.`);
            } else {
                logger.debug(`Failed to fetch Radarr update info for ${this.containerName}: ${error.message}`);
            }
            return null;
        }
    }
}
