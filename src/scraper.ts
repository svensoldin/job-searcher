import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from './utils/logger.js';
import { saveJobs } from './database.js';
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
  const url = `https://www.linkedin.com/jobs/search/?geoId=105015875&keywords=${encodeURIComponent(
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
          url: linkElement ? (linkElement as HTMLAnchorElement).href : '',
          source: 'linkedin',
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

    // Wait for job listings to load with multiple selectors as fallbacks
    try {
      await page.waitForSelector(
        '[data-jk], .job_seen_beacon, .jobsearch-SerpJobCard, .slider_container .slider_item',
        { timeout: 10000 }
      );
    } catch (selectorError) {
      logger.warn('Primary selectors not found, trying alternative approach');
      await page.waitForSelector('body', { timeout: 5000 });
    }

    const jobs: JobPosting[] = await page.evaluate(() => {
      // Try multiple selector strategies for Indeed's changing layout
      let jobElements: NodeListOf<Element> | null = null;

      // Strategy 1: data-jk attribute (older layout)
      jobElements = document.querySelectorAll('[data-jk]');

      // Strategy 2: job_seen_beacon class (common layout)
      if (jobElements.length === 0) {
        jobElements = document.querySelectorAll('.job_seen_beacon');
      }

      // Strategy 3: jobsearch-SerpJobCard (another layout)
      if (jobElements.length === 0) {
        jobElements = document.querySelectorAll('.jobsearch-SerpJobCard');
      }

      // Strategy 4: slider items (newer layout)
      if (jobElements.length === 0) {
        jobElements = document.querySelectorAll(
          '.slider_container .slider_item'
        );
      }

      return Array.from(jobElements)
        .map((element) => {
          // Try multiple selector patterns for job title
          let titleElement =
            element.querySelector('[data-testid="job-title"]') ||
            element.querySelector('.jobTitle a span') ||
            element.querySelector('h2 a span') ||
            element.querySelector('.jobTitle span') ||
            element.querySelector('h2.jobTitle a');

          // Try multiple selector patterns for company name
          let companyElement =
            element.querySelector('[data-testid="company-name"]') ||
            element.querySelector('.companyName') ||
            element.querySelector('[data-testid="company-name"] a') ||
            element.querySelector('span.companyName a');

          // Try multiple selector patterns for job link
          let linkElement =
            element.querySelector('h2 a') ||
            element.querySelector('.jobTitle a') ||
            element.querySelector('[data-jk] h2 a');

          return {
            title: titleElement ? titleElement.textContent?.trim() || '' : '',
            company: companyElement
              ? companyElement.textContent?.trim() || ''
              : '',
            url: linkElement
              ? `https://www.indeed.com${
                  (linkElement as HTMLAnchorElement).getAttribute('href') || ''
                }`
              : '',
            source: 'indeed',
          };
        })
        .filter((job) => job.title && job.company); // Filter out empty results
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
  jobUrl: string
): Promise<string> => {
  try {
    const page: Page = await browser.newPage();
    await page.goto(jobUrl, { waitUntil: 'networkidle2' });

    let description = '';

    // Detect source from URL
    if (jobUrl.includes('linkedin.com')) {
      await page.waitForSelector('.show-more-less-html__markup', {
        timeout: 5000,
      });
      description = await page.$eval(
        '.show-more-less-html__markup',
        (el) => el.textContent?.trim() || ''
      );
    } else if (jobUrl.includes('indeed.com')) {
      // Try multiple selectors for job description
      try {
        await page.waitForSelector(
          '#jobDescriptionText, .jobsearch-jobDescriptionText, [data-testid="jobsearch-JobComponent-description"]',
          { timeout: 5000 }
        );

        // Try different selectors in order of preference
        const descriptionElement =
          (await page.$('#jobDescriptionText')) ||
          (await page.$('.jobsearch-jobDescriptionText')) ||
          (await page.$(
            '[data-testid="jobsearch-JobComponent-description"]'
          )) ||
          (await page.$('.jobDescriptionContent'));

        if (descriptionElement) {
          description = await page.evaluate(
            (el) => el.textContent?.trim() || '',
            descriptionElement
          );
        }
      } catch (selectorError) {
        logger.warn(
          `Could not find job description with standard selectors for ${jobUrl}`
        );
      }
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
      job.description = await getJobDescription(browser, job.url);
      // Add delay to be respectful to the servers
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return jobs;
};

/**
 * Search for jobs across multiple platforms and save to database
 */
export const scrapeAndSaveJobs = async (
  searchParams: SearchParams
): Promise<number> => {
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

    // Fetch detailed descriptions for all jobs
    const enrichedJobs = await enrichJobsWithDescriptions(browser, uniqueJobs);

    // Save to database
    const savedCount = await saveJobs(enrichedJobs);

    return savedCount;
  } catch (error) {
    logger.error('Error in job scraping and saving:', error);
    throw error;
  } finally {
    await closeBrowser(browser);
  }
};

/**
 * Search for jobs across multiple platforms (legacy function)
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
  scrapeAndSaveJobs,
};
