import type { Page } from 'puppeteer';
import type { JobPosting } from 'types.js';

export const extractJobDataFromElements = (
  elements: Element[]
): JobPosting[] => {
  return elements.map((element) => {
    const titleElement = element.querySelector('.base-search-card__title');
    const companyElement = element.querySelector('.base-search-card__subtitle');
    const locationElement = element.querySelector('.job-search-card__location');
    const linkElement = element.querySelector(
      'a[data-tracking-control-name="public_jobs_jserp-result_search-card"]'
    );

    return {
      title: titleElement ? titleElement.textContent?.trim() || '' : '',
      company: companyElement ? companyElement.textContent?.trim() || '' : '',
      location: locationElement
        ? locationElement.textContent?.trim() || ''
        : '',
      url: linkElement ? (linkElement as HTMLAnchorElement).href : '',
      description: '',
      source: 'linkedin',
    };
  });
};

export const getJobs = async (
  page: Page,
  limit: number
): Promise<JobPosting[]> => {
  const jobs = await page.evaluate((maxJobs) => {
    const jobElements = document.querySelectorAll('.job-search-card');
    const limitedElements = Array.from(jobElements).slice(0, maxJobs);

    return limitedElements.map((element) => {
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
        company: companyElement ? companyElement.textContent?.trim() || '' : '',
        location: locationElement
          ? locationElement.textContent?.trim() || ''
          : '',
        url: linkElement ? (linkElement as HTMLAnchorElement).href : '',
        description: '',
        source: 'linkedin',
      };
    });
  }, limit);

  return jobs;
};
