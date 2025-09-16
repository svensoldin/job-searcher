import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { logger } from './utils/logger.js';
import type { JobPosting, SearchParams } from './types.js';

/**
 * Create and initialize a browser instance
 */
export const createBrowser = async (): Promise<Browser> => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    logger.info('Browser initialized successfully');
    return browser;
  } catch (error) {
    logger.error('Failed to initialize browser:', error);
    throw error;
  }
};

/**
 * Close browser instance
 */
export const closeBrowser = async (browser: Browser): Promise<void> => {
  if (browser) {
    await browser.close();
    logger.info('Browser closed');
  }
};

/**
 * Search for jobs on LinkedIn
 */
export const scrapeLinkedIn = async (
  browser: Browser,
  searchParams: SearchParams
): Promise<JobPosting[]> => {
  const { keywords, location, experienceLevel } = searchParams;
  const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
    keywords
  )}&location=${encodeURIComponent(location)}`;

  try {
    const page: Page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for job listings to load
    await page.waitForSelector('.jobs-search__results-list', {
      timeout: 10000,
    });

    const jobs: JobPosting[] = await page.evaluate(() => {
      const jobElements = document.querySelectorAll('.job-search-card');
      return Array.from(jobElements).map((element) => {
        const titleElement = element.querySelector('.base-search-card__title');
        const companyElement = element.querySelector(
          '.base-search-card__subtitle'
        );
        const locationElement = element.querySelector(
          '.job-search-card__location'
        );
        const linkElement = element.querySelector(
          'a[data-tracking-control-name="public_jobs_jserp-result_search-card"]'
        );

        return {
          title: titleElement ? titleElement.textContent?.trim() || '' : '',
          company: companyElement
            ? companyElement.textContent?.trim() || ''
            : '',
          location: locationElement
            ? locationElement.textContent?.trim() || ''
            : '',
          url: linkElement ? (linkElement as HTMLAnchorElement).href : '',
          source: 'LinkedIn' as const,
          dateFound: new Date().toISOString(),
        };
      });
    });

    await page.close();
    logger.info(`Scraped ${jobs.length} jobs from LinkedIn`);
    return jobs;
  } catch (error) {
    logger.error('Error scraping LinkedIn:', error);
    return [];
  }
};

/**
 * Search for jobs on Indeed
 */
export const scrapeIndeed = async (
  browser: Browser,
  searchParams: SearchParams
): Promise<JobPosting[]> => {
  const { keywords, location } = searchParams;
  const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(
    keywords
  )}&l=${encodeURIComponent(location)}`;

  try {
    const page: Page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for job listings to load
    await page.waitForSelector('[data-jk]', { timeout: 10000 });

    const jobs: JobPosting[] = await page.evaluate(() => {
      const jobElements = document.querySelectorAll('[data-jk]');
      return Array.from(jobElements).map((element) => {
        const titleElement = element.querySelector('[data-testid="job-title"]');
        const companyElement = element.querySelector(
          '[data-testid="company-name"]'
        );
        const locationElement = element.querySelector(
          '[data-testid="job-location"]'
        );
        const linkElement = element.querySelector('h2 a');

        return {
          title: titleElement ? titleElement.textContent?.trim() || '' : '',
          company: companyElement
            ? companyElement.textContent?.trim() || ''
            : '',
          location: locationElement
            ? locationElement.textContent?.trim() || ''
            : '',
          url: linkElement
            ? `https://www.indeed.com${(
                linkElement as HTMLAnchorElement
              ).getAttribute('href')}`
            : '',
          source: 'Indeed' as const,
          dateFound: new Date().toISOString(),
        };
      });
    });

    await page.close();
    logger.info(`Scraped ${jobs.length} jobs from Indeed`);
    return jobs;
  } catch (error) {
    logger.error('Error scraping Indeed:', error);
    return [];
  }
};

/**
 * Get detailed job description from a job URL
 */
export const getJobDescription = async (
  browser: Browser,
  jobUrl: string,
  source: string
): Promise<string> => {
  try {
    const page: Page = await browser.newPage();
    await page.goto(jobUrl, { waitUntil: 'networkidle2' });

    let description = '';

    if (source === 'LinkedIn') {
      await page.waitForSelector('.show-more-less-html__markup', {
        timeout: 5000,
      });
      description = await page.$eval(
        '.show-more-less-html__markup',
        (el) => el.textContent?.trim() || ''
      );
    } else if (source === 'Indeed') {
      await page.waitForSelector('#jobDescriptionText', { timeout: 5000 });
      description = await page.$eval(
        '#jobDescriptionText',
        (el) => el.textContent?.trim() || ''
      );
    }

    await page.close();
    return description;
  } catch (error) {
    logger.warn(
      `Could not fetch job description from ${jobUrl}:`,
      error instanceof Error ? error.message : String(error)
    );
    return '';
  }
};

/**
 * Remove duplicate jobs based on title and company
 */
export const removeDuplicateJobs = (jobs: JobPosting[]): JobPosting[] => {
  return jobs.filter(
    (job, index, self) =>
      index ===
      self.findIndex(
        (j) =>
          j.title.toLowerCase() === job.title.toLowerCase() &&
          j.company.toLowerCase() === job.company.toLowerCase()
      )
  );
};

/**
 * Fetch detailed descriptions for jobs
 */
export const enrichJobsWithDescriptions = async (
  browser: Browser,
  jobs: JobPosting[],
  maxJobs: number = 20
): Promise<JobPosting[]> => {
  const jobsToEnrich = jobs.slice(0, maxJobs);

  for (let i = 0; i < jobsToEnrich.length; i++) {
    const job = jobsToEnrich[i];
    if (job && job.url) {
      job.description = await getJobDescription(browser, job.url, job.source);
      // Add delay to be respectful to the servers
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return jobs;
};

/**
 * Search for jobs across multiple platforms
 */
export const searchJobs = async (
  searchParams: SearchParams
): Promise<JobPosting[]> => {
  const browser = await createBrowser();

  try {
    // Scrape from multiple sources
    const [linkedInJobs, indeedJobs] = await Promise.all([
      scrapeLinkedIn(browser, searchParams),
      scrapeIndeed(browser, searchParams),
    ]);

    const allJobs = [...linkedInJobs, ...indeedJobs];

    // Remove duplicates
    const uniqueJobs = removeDuplicateJobs(allJobs);

    logger.info(`Found ${uniqueJobs.length} unique jobs after deduplication`);

    // Fetch detailed descriptions for top jobs
    const enrichedJobs = await enrichJobsWithDescriptions(browser, uniqueJobs);

    return enrichedJobs;
  } catch (error) {
    logger.error('Error in job search:', error);
    throw error;
  } finally {
    await closeBrowser(browser);
  }
};

export default {
  createBrowser,
  closeBrowser,
  scrapeLinkedIn,
  scrapeIndeed,
  getJobDescription,
  removeDuplicateJobs,
  enrichJobsWithDescriptions,
  searchJobs,
};
