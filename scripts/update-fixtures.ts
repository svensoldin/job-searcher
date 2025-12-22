import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(
  __dirname,
  '../src/__tests__/scraping/linkedin/fixtures'
);

async function fetchLinkedInJobList() {
  console.log('🚀 Fetching LinkedIn job list HTML...');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    );

    // Search for a generic query to get job listings
    const url =
      'https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=San%20Francisco';

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    try {
      await page.waitForSelector('.jobs-search__results-list', {
        timeout: 10000,
      });
    } catch {
      console.warn('⚠️  Main selector not found, trying alternate...');
      await page.waitForSelector('body', { timeout: 5000 });
    }

    const html = await page.content();

    const outputPath = path.join(FIXTURES_DIR, 'linkedin-job-list.html');
    fs.writeFileSync(outputPath, html, 'utf-8');

    console.log(`✅ Saved job list HTML to ${outputPath}`);
    console.log(`📊 HTML size: ${(html.length / 1024).toFixed(2)} KB`);

    await browser.close();
  } catch (error) {
    console.error('❌ Error fetching job list:', error);
    await browser.close();
    throw error;
  }
}

async function fetchLinkedInJobDescription() {
  console.log('🚀 Fetching LinkedIn job description HTML...');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    );

    // First get a job URL from the search results
    const searchUrl =
      'https://www.linkedin.com/jobs/search/?keywords=software%20engineer';
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for job cards and get first job URL
    await page.waitForSelector('.job-search-card', { timeout: 10000 });

    const firstJobUrl = await page.evaluate(() => {
      const linkElement = document.querySelector(
        'a[data-tracking-control-name="public_jobs_jserp-result_search-card"]'
      );
      return linkElement ? (linkElement as HTMLAnchorElement).href : null;
    });

    if (!firstJobUrl) {
      throw new Error('Could not find job URL');
    }

    console.log(`📄 Fetching job details from: ${firstJobUrl}`);

    // Navigate to job details page
    await page.goto(firstJobUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    try {
      await page.waitForSelector('.show-more-less-html__markup', {
        timeout: 5000,
      });
    } catch {
      console.warn('⚠️  Description selector not found, using body');
    }

    const html = await page.content();

    const outputPath = path.join(FIXTURES_DIR, 'linkedin-job-description.html');
    fs.writeFileSync(outputPath, html, 'utf-8');

    console.log(`✅ Saved job description HTML to ${outputPath}`);
    console.log(`📊 HTML size: ${(html.length / 1024).toFixed(2)} KB`);

    await browser.close();
  } catch (error) {
    console.error('❌ Error fetching job description:', error);
    await browser.close();
    throw error;
  }
}

async function main() {
  console.log('🔄 Updating LinkedIn test fixtures with real HTML...\n');

  try {
    await fetchLinkedInJobList();
    console.log('');
    await fetchLinkedInJobDescription();

    console.log('\n✨ All fixtures updated successfully!');
    console.log('\n💡 Tip: Run tests to verify: pnpm test linkedin.test.ts');
  } catch (error) {
    console.error('\n❌ Failed to update fixtures:', error);
    process.exit(1);
  }
}

main();
