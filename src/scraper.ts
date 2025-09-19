import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from './utils/logger.js';
import { saveJobToDatabase, Job, createJobHash } from './database.js';
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
 * Search for jobs on Welcome to the Jungle
 */

const welcomeToTheJungleJobSelector = '.ais-Hits-list-item';
export const scrapeWelcomeToTheJungle = async (
  browser: Browser,
  searchParams: SearchParams
): Promise<JobPosting[]> => {
  const { keywords, location } = searchParams;
  // Welcome to the Jungle search URL format
  const baseUrl = 'https://www.welcometothejungle.com/fr/jobs';
  const searchQuery = keywords.replace(/,/g, ' ').trim();
  const url = `${baseUrl}?query=${encodeURIComponent(
    searchQuery
  )}&refinementList%5Boffices.country_code%5D%5B%5D=FR&refinementList%5Boffices.country_code%5D%5B%5D=remote`;

  try {
    const page: Page = await browser.newPage();

    // Set user agent to avoid bot detection
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for job listings to load
    try {
      await page.waitForSelector(welcomeToTheJungleJobSelector, {
        timeout: 15000,
      });
    } catch (selectorError) {
      logger.warn(
        'Welcome to the Jungle: Primary selectors not found, trying alternative approach'
      );
      await page.waitForSelector('body', { timeout: 5000 });
    }

    const jobs: JobPosting[] = await page.evaluate(() => {
      // Try multiple selector strategies for Welcome to the Jungle
      let jobElements: NodeListOf<Element> | null = null;

      jobElements = document.querySelectorAll(welcomeToTheJungleJobSelector);

      return Array.from(jobElements)
        .map((element) => {
          // Try multiple selector patterns for job title
          let titleElement =
            element.querySelector('[data-testid="job-title"]') ||
            element.querySelector('h2') ||
            element.querySelector('h3') ||
            element.querySelector('[class*="title"]') ||
            element.querySelector('a[href*="/jobs/"]');

          // Try multiple selector patterns for company name
          let companyElement =
            element.querySelector('[data-testid="company-name"]') ||
            element.querySelector('[class*="company"]') ||
            element.querySelector('[class*="organization"]') ||
            element.querySelector('a[href*="/companies/"]');

          // Try to find job links
          let linkElement =
            element.querySelector('a[href*="/jobs/"]') ||
            element.querySelector('a[data-testid="job-link"]') ||
            element.querySelector('a');

          let jobUrl = '';
          if (linkElement) {
            const href = (linkElement as HTMLAnchorElement).href;
            // Ensure we have absolute URLs
            if (href && href.startsWith('/')) {
              jobUrl = `https://www.welcometothejungle.com${href}`;
            } else if (
              href &&
              (href.startsWith('http://') || href.startsWith('https://'))
            ) {
              jobUrl = href;
            }
          }

          const title = titleElement
            ? titleElement.textContent?.trim() || ''
            : '';
          const company = companyElement
            ? companyElement.textContent?.trim() || ''
            : '';

          return {
            title,
            company,
            url: jobUrl,
            source: 'welcometothejungle',
          };
        })
        .filter((job) => job.title && job.company && job.url); // Filter out empty results
    });

    await page.close();
    logger.info(`Scraped ${jobs.length} jobs from Welcome to the Jungle`);
    return jobs;
  } catch (error) {
    logger.error('Error scraping Welcome to the Jungle:', error);
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
    } else if (jobUrl.includes('welcometothejungle.com')) {
      // Try multiple selectors for Welcome to the Jungle description
      try {
        await page.waitForSelector(
          '[data-testid="job-description"], .sc-1g2uzm9-0, [class*="description"], .job-description, .sc-',
          { timeout: 5000 }
        );

        // Try different selectors in order of preference for WTTJ
        const descriptionElement =
          (await page.$('[data-testid="job-description"]')) ||
          (await page.$('.sc-1g2uzm9-0')) ||
          (await page.$('[class*="description"]')) ||
          (await page.$('.job-description')) ||
          (await page.$('[class*="JobDescription"]'));

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
 * Analyze jobs using rule-based analyzer and save them
 */
export const analyzeAndSaveJobsIncremental = async (
  jobs: JobPosting[],
  userCriteria: any,
  incremental: boolean = false
): Promise<{ analyzed: number; saved: number; failed: number }> => {
  let analyzed = 0;
  let saved = 0;
  let failed = 0;

  logger.info(
    `Starting ${incremental ? 'incremental' : 'batch'} analysis of ${
      jobs.length
    } jobs`
  );

  // Helper function to analyze a single job
  const analyzeJobSafely = (
    job: JobPosting,
    index: number
  ): { analyzedJob: JobPosting | null; success: boolean } => {
    try {
      logger.info(`Analyzing job ${index + 1}/${jobs.length}: ${job.title}`);
      const analyzedJob = analyzeJob(job, userCriteria);
      logger.info(`✅ Analyzed ${job.title} - Score: ${analyzedJob.score}`);
      return { analyzedJob, success: true };
    } catch (error) {
      logger.error(`❌ Failed to analyze job ${job.title}:`, error);
      return { analyzedJob: { ...job, score: 0 }, success: false };
    }
  };

  // Helper function to save a single job (for incremental mode)
  const saveJobSafely = async (job: JobPosting): Promise<boolean> => {
    try {
      const wasSaved = await saveJobToDatabase(job);
      if (wasSaved) {
        logger.info(`💾 Saved ${job.title} to database`);
        return true;
      }
      return false;
    } catch (saveError) {
      logger.error(`Failed to save job: ${job.title}`, saveError);
      return false;
    }
  };

  const processedJobs: JobPosting[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!job) continue;

    const { analyzedJob, success } = analyzeJobSafely(job, i);

    if (success) {
      analyzed++;
    } else {
      failed++;
    }

    if (analyzedJob) {
      processedJobs.push(analyzedJob);

      // In incremental mode, save immediately
      if (incremental) {
        const wasSaved = await saveJobSafely(analyzedJob);
        if (wasSaved) {
          saved++;
        }
      }
    }
  }

  // In batch mode, save all jobs at once
  if (!incremental) {
    try {
      if (processedJobs.length > 0) {
        const jobsToInsert = processedJobs.map((job) => ({
          ...job,
          hash: createJobHash(job),
          analysis_status: 'analyzed',
          scraped_at: new Date(),
        }));

        await Job.insertMany(jobsToInsert, { ordered: false });
        saved = processedJobs.length;
        logger.info(`💾 Batch saved ${saved} jobs to database`);
      }
    } catch (saveError) {
      logger.error('Failed to batch save jobs:', saveError);
      // Fall back to incremental saving
      logger.info('Falling back to incremental saving...');
      return analyzeAndSaveJobsIncremental(jobs, userCriteria, true);
    }
  }

  const results = { analyzed, saved, failed };
  logger.info(
    `📊 ${incremental ? 'Incremental' : 'Batch'} analysis complete:`,
    results
  );
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
    const [linkedInJobs, welcomeToTheJungleJobs] = await Promise.all([
      scrapeLinkedIn(browser, searchParams),
      scrapeWelcomeToTheJungle(browser, searchParams),
    ]);

    const allJobs = [...linkedInJobs, ...welcomeToTheJungleJobs];
    const uniqueJobs = removeDuplicateJobs(allJobs);

    logger.info(`Scraped ${uniqueJobs.length} unique jobs`);

    if (uniqueJobs.length === 0) {
      logger.warn('No jobs found during scraping');
      return 0;
    }

    // Step 2: Fetch detailed descriptions
    logger.info('Step 2: Fetching job descriptions...');
    const enrichedJobs = await enrichJobsWithDescriptions(browser, uniqueJobs);

    // Step 3: Analyze jobs with rule-based analyzer and save in batch
    logger.info(
      'Step 3: Analyzing jobs with rule-based analyzer (batch saving)...'
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

export default {
  createBrowser,
  closeBrowser,
  scrapeLinkedIn,
  scrapeWelcomeToTheJungle,
  getJobDescription,
  removeDuplicateJobs,
  enrichJobsWithDescriptions,
  analyzeAndSaveJobsIncremental,
  runWeeklyJobProcessing,
};
