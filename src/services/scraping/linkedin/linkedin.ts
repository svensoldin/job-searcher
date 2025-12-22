import type { Browser } from 'puppeteer';
import type { JobPosting, ScrapeCriteria } from 'types.js';
import logger from 'utils/logger.js';
import {
  getJobDescription,
  initializePageAndNavigate,
  MAX_JOBS_PER_BOARD,
} from '../common.js';
import { getJobs } from './helpers.js';

const BASE_URL = 'https://www.linkedin.com/jobs/search/';
const PRIMARY_SELECTOR = '.jobs-search__results-list';

export const LINKEDIN_DESCRIPTION_SELECTORS = [
  '.show-more-less-html__markup',
  '.description__text',
  '[class*="description"]',
  '.jobs-description',
  'article',
];

export const scrapeLinkedIn = async (
  browser: Browser,
  criteria: ScrapeCriteria,
  limit: number = MAX_JOBS_PER_BOARD
): Promise<JobPosting[]> => {
  const keywords = criteria.jobTitle;
  const location = criteria.location || '';
  const url = `${BASE_URL}?keywords=${encodeURIComponent(
    keywords
  )}&location=${encodeURIComponent(location)}`;

  try {
    const page = await initializePageAndNavigate(
      browser,
      url,
      PRIMARY_SELECTOR
    );

    const jobs = await getJobs(page, limit);

    await page.close();

    logger.info(`Found ${jobs.length} LinkedIn jobs`);

    logger.info(`Fetching descriptions for ${jobs.length} LinkedIn jobs...`);

    for (const job of jobs) {
      await getJobDescription(browser, job, LINKEDIN_DESCRIPTION_SELECTORS);
    }

    logger.info(`Scraped ${jobs.length} jobs from LinkedIn`);
    return jobs;
  } catch (error) {
    logger.error('Error scraping LinkedIn:', error);
    return [];
  }
};
