import { analyzeJob } from './analyzers/rule-based.js';
import { config } from './config.js';
import { createJobHash, Job, saveJobToDatabase } from './database.js';
import { logger } from './utils/logger.js';
import puppeteer, { Browser, Page } from 'puppeteer';

import type { JobPosting, SearchParams } from './types.js';

/**
 * Purge all existing jobs from database before weekly refresh
 */
export const purgeExistingJobs = async (): Promise<number> => {
  try {
    const deleteResult = await Job.deleteMany({});
    const deletedCount = deleteResult.deletedCount || 0;
    logger.info(`🗑️  Purged ${deletedCount} existing jobs from database`);
    return deletedCount;
  } catch (error) {
    logger.error('Error purging existing jobs:', error);
    throw error;
  }
};

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
  )}refinementList[offices.country_code][]=FR&refinementList[remote][]=fulltime&refinementList[benefits][]=Ouvert au télétravail total&collections[]=digital_nomad`;

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
      // Get all job links
      const jobLinks = Array.from(
        document.querySelectorAll('a[href*="/jobs/"]')
      );

      // Process job links to extract job information
      const jobsMap = new Map(); // Use Map to avoid duplicates

      for (const link of jobLinks) {
        const href = (link as HTMLAnchorElement).href;
        const linkText = link.textContent?.trim() || '';

        // Skip empty links (probably image links)
        if (!linkText) continue;

        // Extract company name from URL (format: /fr/companies/company-name/jobs/...)
        const urlMatch = href.match(/\/companies\/([^\/]+)\/jobs\//);
        const companySlug = urlMatch ? urlMatch[1] : '';

        // Clean up company name (remove hyphens, capitalize)
        const company = companySlug
          ? companySlug
              .split('-')
              .map(
                (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
              )
              .join(' ')
          : 'Unknown Company';

        // Use href as key to avoid duplicates
        if (!jobsMap.has(href)) {
          jobsMap.set(href, {
            title: linkText,
            company: company,
            url: href,
            source: 'welcometothejungle',
          });
        }
      }

      return Array.from(jobsMap.values());
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
      // Welcome to the Jungle: Look for the specific position section
      try {
        // Wait for the page to load completely
        await page.waitForSelector('#the-position-section', { timeout: 15000 });
        
        const descriptionElement = await page.$('#the-position-section');
        if (descriptionElement) {
          description = await page.evaluate(
            (el) => el.textContent?.trim() || '',
            descriptionElement
          );
          
          if (description && description.length > 50) {
            logger.debug(`✅ WTTJ: Found job description in #the-position-section (${description.length} chars)`);
          } else {
            logger.warn(`❌ WTTJ: #the-position-section found but content too short: ${description.length} chars`);
          }
        } else {
          logger.warn(`❌ WTTJ: #the-position-section element not found for ${jobUrl}`);
        }
      } catch (selectorError) {
        logger.warn(
          `❌ WTTJ: Could not find #the-position-section for ${jobUrl}:`,
          selectorError instanceof Error ? selectorError.message : String(selectorError)
        );
        
        // Fallback to other selectors if the main one fails
        try {
          logger.info(`🔄 WTTJ: Trying fallback selectors for ${jobUrl}`);
          const fallbackSelectors = [
            '[data-testid="job-description"]',
            '.sc-1g2uzm9-0', 
            '[class*="description"]',
            '.job-description',
            '[class*="JobDescription"]',
            'main [class*="content"]'
          ];
          
          for (const selector of fallbackSelectors) {
            const element = await page.$(selector);
            if (element) {
              description = await page.evaluate(
                (el) => el.textContent?.trim() || '',
                element
              );
              if (description && description.length > 50) {
                logger.debug(`✅ WTTJ: Fallback success with ${selector} (${description.length} chars)`);
                break;
              }
            }
          }
          
          if (!description || description.length <= 50) {
            logger.warn(`❌ WTTJ: All fallback selectors failed for ${jobUrl}`);
          }
        } catch (fallbackError) {
          logger.error(`❌ WTTJ: Fallback error for ${jobUrl}:`, fallbackError);
        }
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
  jobs: JobPosting[]
): Promise<JobPosting[]> => {
  logger.info(`📄 Fetching descriptions for ${jobs.length} jobs...`);

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (job && job.url) {
      logger.info(`📖 Fetching description ${i + 1}/${jobs.length}: ${job.title} at ${job.company}`);
      job.description = await getJobDescription(browser, job.url);
      
      if (job.description && job.description.length > 50) {
        logger.debug(`✅ Got description (${job.description.length} chars) for ${job.title}`);
      } else {
        logger.warn(`❌ No/short description (${job.description?.length || 0} chars) for ${job.title}`);
      }
      
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

    // Step 0: Purge existing jobs to prevent duplicates
    logger.info('Step 0: Purging existing jobs from database...');
    await purgeExistingJobs();

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
  purgeExistingJobs,
  scrapeLinkedIn,
  scrapeWelcomeToTheJungle,
  getJobDescription,
  removeDuplicateJobs,
  enrichJobsWithDescriptions,
  analyzeAndSaveJobsIncremental,
  runWeeklyJobProcessing,
};
