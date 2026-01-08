/**
 * ShowcaseData.js
 * Module responsible for fetching and managing showcase project data.
 */

/**
 * Fetches project data from the JSON configuration.
 * @returns {Promise<Object>} The project data object containing the "projects" array.
 * @throws {Error} If the network request fails or data is invalid.
 */
export async function fetchProjects() {
    const DATA_URL = 'data/projects.json';

    try {
        const response = await fetch(DATA_URL);

        if (!response.ok) {
            throw new Error(`[ShowcaseData] HTTP Error: ${response.status} ${response.statusText} for URL: ${DATA_URL}`);
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('[ShowcaseData] Fetch failed:', error);
        // Re-throw to allow caller to handle or display UI error
        throw error;
    }
}
