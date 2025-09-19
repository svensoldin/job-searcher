import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from './utils/logger.js';
import { saveJobToDatabase } from './database.js';
import { analyzeJob } from './analyzers/rule-based.js';
import { config } from './config.js';
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
 * Search for jobs on Google Jobs
 */
export const scrapeGoogleJobs = async (
  browser: Browser,
  searchParams: SearchParams
): Promise<JobPosting[]> => {
  const { keywords, location } = searchParams;
  const url = `https://www.google.com/search?q=${encodeURIComponent(
    keywords + ' jobs'
  )}+${encodeURIComponent(location)}&ibp=htl;jobs`;

  try {
    const page: Page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for job listings to load with multiple selectors as fallbacks
    try {
      await page.waitForSelector(
        '[data-ved][jsname] h3, .PwjeAc, [role="listitem"], .BjJfJf',
        { timeout: 10000 }
      );
    } catch (selectorError) {
      logger.warn('Primary selectors not found, trying alternative approach');
      await page.waitForSelector('body', { timeout: 5000 });
    }

    const jobs: JobPosting[] = await page.evaluate(() => {
      // Try multiple selector strategies for Google Jobs
      let jobElements: NodeListOf<Element> | null = null;

      // Strategy 1: Look for job listing items
      jobElements = document.querySelectorAll('[role="listitem"]');

      // Strategy 2: Look for job cards with specific patterns
      if (jobElements.length === 0) {
        jobElements = document.querySelectorAll('.PwjeAc');
      }

      // Strategy 3: Look for elements with job-specific attributes
      if (jobElements.length === 0) {
        jobElements = document.querySelectorAll('[data-ved][jsname]');
      }

      // Strategy 4: Look for job title containers
      if (jobElements.length === 0) {
        jobElements = document.querySelectorAll(
          'div:has(.BjJfJf), div:has(h3)'
        );
      }

      return Array.from(jobElements)
        .map((element) => {
          // Try multiple selector patterns for job title
          let titleElement =
            element.querySelector('h3') ||
            element.querySelector('[role="heading"]') ||
            element.querySelector('.BjJfJf') ||
            element.querySelector('div[style*="font-weight"]') ||
            element.querySelector('[data-test-id="job-title"]');

          // Try multiple selector patterns for company name
          let companyElement =
            element.querySelector('.vNEEBe') ||
            element.querySelector('.nJlQNd') ||
            element.querySelector('[data-test-id="employer-name"]') ||
            element.querySelector('span[style*="color"]') ||
            element.querySelector('.BjJfJf + div');

          // Try to find clickable elements for job links
          let linkElement =
            element.querySelector('a[href*="jobs"]') ||
            element.querySelector('a[data-ved]') ||
            element.querySelector('a');

          return {
            title: titleElement ? titleElement.textContent?.trim() || '' : '',
            company: companyElement
              ? companyElement.textContent?.trim() || ''
              : '',
            url: linkElement
              ? (linkElement as HTMLAnchorElement).href || ''
              : '',
            source: 'google',
          };
        })
        .filter((job) => job.title && job.company && job.url); // Filter out empty results
    });

    await page.close();
    logger.info(`Scraped ${jobs.length} jobs from Google Jobs`);
    return jobs;
  } catch (error) {
    logger.error('Error scraping Google Jobs:', error);
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
    } else if (jobUrl.includes('google.com')) {
      // Try multiple selectors for Google Jobs description
      try {
        await page.waitForSelector(
          '.HBvzbc, .YgLbBe, [data-test-id="job-description"], .g9WBQb',
          { timeout: 5000 }
        );

        // Try different selectors in order of preference
        const descriptionElement =
          (await page.$('.HBvzbc')) ||
          (await page.$('.YgLbBe')) ||
          (await page.$('[data-test-id="job-description"]')) ||
          (await page.$('.g9WBQb')) ||
          (await page.$('.Qk80Jf'));

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
 * Analyze jobs using rule-based analyzer and save them incrementally
 */
export const analyzeAndSaveJobsIncremental = async (
  jobs: JobPosting[],
  userCriteria: any
): Promise<{ analyzed: number; saved: number; failed: number }> => {
  let analyzed = 0;
  let saved = 0;
  let failed = 0;

  logger.info(`Starting incremental analysis of ${jobs.length} jobs`);

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!job) continue;

    try {
      logger.info(`Analyzing job ${i + 1}/${jobs.length}: ${job.title}`);

      // Analyze the job using rule-based analyzer (instant, no API calls)
      const analyzedJob = analyzeJob(job, userCriteria);
      analyzed++;

      // Save immediately to database
      const wasSaved = await saveJobToDatabase(analyzedJob);
      if (wasSaved) {
        saved++;
      }

      logger.info(`✅ Completed ${job.title} - Score: ${analyzedJob.score}`);
    } catch (error) {
      failed++;
      logger.error(`❌ Failed to analyze job ${job.title}:`, error);

      // Save the job without analysis (score = 0) so we don't lose it
      try {
        await saveJobToDatabase({ ...job, score: 0 });
        saved++;
        logger.info(`💾 Saved failed job to database: ${job.title}`);
      } catch (saveError) {
        logger.error(`Failed to save failed job: ${job.title}`, saveError);
      }
    }
  }

  const results = { analyzed, saved, failed };
  logger.info(`📊 Incremental analysis complete:`, results);
  return results;
};

/**
 * Weekly job processing: scrape → analyze → save with refresh pattern
 */
export const runWeeklyJobProcessing = async (
  searchParams: SearchParams
): Promise<number> => {
  const browser = await createBrowser();

  try {
    logger.info('Starting weekly job processing...');

    // Step 1: Scrape from multiple sources
    logger.info('Step 1: Scraping jobs...');
    const [linkedInJobs, googleJobs] = await Promise.all([
      scrapeLinkedIn(browser, searchParams),
      scrapeGoogleJobs(browser, searchParams),
    ]);

    const allJobs = [...linkedInJobs, ...googleJobs];
    const uniqueJobs = removeDuplicateJobs(allJobs);

    logger.info(`Scraped ${uniqueJobs.length} unique jobs`);

    if (uniqueJobs.length === 0) {
      logger.warn('No jobs found during scraping');
      return 0;
    }

    // Step 2: Fetch detailed descriptions
    logger.info('Step 2: Fetching job descriptions...');
    const enrichedJobs = await enrichJobsWithDescriptions(browser, uniqueJobs);

    // Step 3: Analyze jobs with rule-based analyzer and save incrementally
    logger.info(
      'Step 3: Analyzing jobs with rule-based analyzer (saving progress as we go)...'
    );
    const results = await analyzeAndSaveJobsIncremental(
      enrichedJobs,
      config.jobCriteria
    );

    logger.info(
      `Analysis complete: ${results.analyzed} analyzed, ${results.saved} saved, ${results.failed} failed`
    );
    return results.saved;
  } catch (error) {
    logger.error('Error in weekly job processing:', error);
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
    const [linkedInJobs, googleJobs] = await Promise.all([
      scrapeLinkedIn(browser, searchParams),
      scrapeGoogleJobs(browser, searchParams),
    ]);

    const allJobs = [...linkedInJobs, ...googleJobs];

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
  scrapeGoogleJobs,
  getJobDescription,
  removeDuplicateJobs,
  enrichJobsWithDescriptions,
  analyzeAndSaveJobsIncremental,
  searchJobs,
  runWeeklyJobProcessing,
};
