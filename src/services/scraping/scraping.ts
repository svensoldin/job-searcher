import type { ScrapeCriteria } from '../../types.js';
import { logger } from '../../utils/logger.js';
import { scrapeLinkedIn } from './linkedin/linkedin.js';
import { closeBrowser, createBrowser } from './common.js';
import scrapeWelcomeToTheJungle from './wttj.js';

export default async function scrapeJobsForAnalysis(
  criteria: ScrapeCriteria,
  onProgress?: (progress: number, message: string) => void
) {
  const browser = await createBrowser();

  try {
    logger.info(`🕷️ Starting job scraping for: ${criteria.jobTitle}`);

    onProgress?.(15, 'Scraping Welcome to the Jungle...');
    const welcomeToTheJungleJobs = await scrapeWelcomeToTheJungle(
      browser,
      criteria
    );

    onProgress?.(
      40,
      `Found ${welcomeToTheJungleJobs.length} jobs from Welcome to the Jungle`
    );

    onProgress?.(45, 'Scraping LinkedIn...');
    const linkedInJobs = await scrapeLinkedIn(browser, criteria);

    onProgress?.(65, `Found ${linkedInJobs.length} jobs from LinkedIn`);

    const allJobs = [...welcomeToTheJungleJobs, ...linkedInJobs];

    const uniqueJobs = allJobs.filter(
      (job, index, self) => index === self.findIndex((j) => j.url === job.url)
    );

    logger.info(`📊 Found ${uniqueJobs.length} unique jobs`);

    if (uniqueJobs.length === 0) {
      return [];
    }

    logger.info(
      `✅ Successfully scraped ${uniqueJobs.length} jobs with descriptions`
    );

    return uniqueJobs;
  } catch (error) {
    logger.error('Error in job scraping:', error);
    throw error;
  } finally {
    await closeBrowser(browser);
  }
}
