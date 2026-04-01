import { ApplicationApiAdapter } from './ApplicationApiAdapter';
import { RadarrAdapter } from './RadarrAdapter';
import logger from '../services/LoggerService';

export class ApplicationApiAdapterFactory {
    private static adapters = [
        RadarrAdapter,
        // Add more adapters here as they are implemented
        // SonarrAdapter,
        // ProwlarrAdapter,
        // etc.
    ];

    /**
     * Get the appropriate adapter for a container
     * @param containerName The name of the container
     * @param image The image name
     * @param apiKey Optional API key for authentication
     * @param baseUrl Optional base URL for the application
     */
    static getAdapter(
        containerName: string,
        image: string,
        apiKey?: string,
        baseUrl?: string
    ): ApplicationApiAdapter | null {
        for (const AdapterClass of this.adapters) {
            if (AdapterClass.canHandle(containerName, image)) {
                logger.debug(`Using ${AdapterClass.displayName} adapter for container: ${containerName}`);
                return new AdapterClass(containerName, apiKey, baseUrl);
            }
        }

        logger.debug(`No application API adapter found for container: ${containerName}`);
        return null;
    }

    /**
     * Get the display name of the adapter that can handle this container
     */
    static getAdapterName(containerName: string, image: string): string | null {
        for (const AdapterClass of this.adapters) {
            if (AdapterClass.canHandle(containerName, image)) {
                return AdapterClass.displayName;
            }
        }
        return null;
    }
}
