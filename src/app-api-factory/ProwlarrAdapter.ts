import { ApplicationApiAdapter, AppUpdateInfo } from './ApplicationApiAdapter';
import logger from '../services/LoggerService';

interface ProwlarrUpdate {
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

export class ProwlarrAdapter extends ApplicationApiAdapter {
    static get displayName(): string {
        return 'Prowlarr';
    }

    static canHandle(containerName: string, image: string): boolean {
        const lowerName = containerName.toLowerCase();
        const lowerImage = image.toLowerCase();
        
        return lowerName.includes('prowlarr') || lowerImage.includes('prowlarr');
    }

    protected getApiUrl(): string {
        if (this.baseUrl) {
            return `${this.baseUrl}/api/v1/update`;
        }
        
        // Default to localhost with common Prowlarr port
        return `http://${this.containerName}:9696/api/v1/update`;
    }

    protected formatReleaseNotes(updates: ProwlarrUpdate[]): string {
        if (!updates || updates.length === 0) {
            return '';
        }

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

            logger.debug(`Fetching Prowlarr updates from: ${url}`);
            
            const response = await this.http.get<ProwlarrUpdate[]>(url, { headers });
            
            if (!response.data || response.data.length === 0) {
                logger.warn(`No update information available for Prowlarr container: ${this.containerName}`);
                return null;
            }

            const latestUpdate = response.data.find(u => u.latest) || response.data[0];
            const releaseNotes = this.formatReleaseNotes(response.data);

            logger.info(`Successfully fetched Prowlarr update info for ${this.containerName}`);

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
                logger.debug(`Could not connect to Prowlarr API for ${this.containerName}: ${error.message}`);
            } else if (error.response?.status === 401) {
                logger.warn(`Prowlarr API authentication failed for ${this.containerName}. API key may be required.`);
            } else {
                logger.debug(`Failed to fetch Prowlarr update info for ${this.containerName}: ${error.message}`);
            }
            return null;
        }
    }
}
