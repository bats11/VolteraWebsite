/**
 * ShowcaseData Module
 * Handles data fetching for the Showcase scene
 */

/**
 * Fetches projects data from the specified JSON URL
 * @param {string} url - The URL to fetch projects data from
 * @returns {Promise<Array>} - The array of project objects
 */
export async function fetchProjectsData(url = 'data/projects.json') {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.projects;
    } catch (error) {
        console.error('[ShowcaseData] Failed to fetch projects data:', error);
        throw error;
    }
}
