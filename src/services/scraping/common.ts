import puppeteer, { Browser, Page } from 'puppeteer';
import type { JobPosting } from 'types.js';
import logger from 'utils/logger.js';

export const MAX_JOBS_PER_BOARD = 15;
export const MAX_JOBS = 50;
export const DELAY_BETWEEN_REQUESTS = 1000;
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

export const closeBrowser = async (browser: Browser): Promise<void> => {
  if (browser) {
    await browser.close();
    logger.info('Browser closed');
  }
};

export const initializePageAndNavigate = async (
  browser: Browser,
  url: string,
  primarySelector: string
): Promise<Page> => {
  const page: Page = await browser.newPage();

  await page.setUserAgent(USER_AGENT);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  try {
    await page.waitForSelector(primarySelector, {
      timeout: 10000,
    });
  } catch (selectorError) {
    logger.warn('Primary selectors not found', selectorError);
    await page.waitForSelector('body', { timeout: 5000 });
  }

  return page;
};

const cleanDescription = (text: string): string => {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
};

export const parseJobDescription = async (
  page: Page,
  selectors: string[],
  minLength: number = 100
): Promise<string> => {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      const description = await page.$eval(
        selector,
        (el) => (el as HTMLElement).innerText || ''
      );
      if (description) {
        if (description.length < minLength)
          console.warn(
            `Description is shorter than minimum length for ${page.url}`
          );
        return cleanDescription(description);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      continue;
    }
  }

  return '';
};

export const getJobDescription = async (
  browser: Browser,
  job: JobPosting,
  selectors: string[]
) => {
  if (!job || !job.url) return;

  try {
    const descPage = await browser.newPage();
    await descPage.setUserAgent(USER_AGENT);

    await descPage.goto(job.url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const description = await parseJobDescription(descPage, selectors);

    job.description = description;

    await descPage.close();

    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
  } catch (error) {
    logger.error(`❌ Error fetching description for ${job.title}:`, error);
  }
};
