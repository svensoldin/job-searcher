import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import type { Browser, Page } from 'puppeteer';
import { extractJobDataFromElements } from './helpers.js';
import { parseJobDescription } from '../common.js';
import { LINKEDIN_DESCRIPTION_SELECTORS, scrapeLinkedIn } from './linkedin.js';

const MOCK_DESC_1 = `This is the first description`;
const MOCK_DESC_2 = `This is the second description`;

describe('Linkedin scraper tests', () => {
  it('parses LinkedIn job card HTML structure correctly (regression)', () => {
    const html = fs.readFileSync(
      path.join(__dirname, 'fixtures/linkedin-job-list.html'),
      'utf-8'
    );

    const dom = new JSDOM(html);
    const jobElements = Array.from(
      dom.window.document.querySelectorAll('.job-search-card')
    );

    const jobs = extractJobDataFromElements(jobElements);

    expect(jobs.length).toBeGreaterThan(0);

    expect(jobs[0]).toBeDefined();
    expect(jobs[0]?.title).toBeTruthy();
    expect(jobs[0]?.company).toBeTruthy();
    expect(jobs[0]?.location).toBeTruthy();
    expect(jobs[0]?.url).toBeTruthy();
    expect(jobs[0]?.source).toBe('linkedin');

    jobs.forEach((job) => {
      expect(job.title).toBeTruthy();
      expect(job.company).toBeTruthy();
    });
  });

  it('parses LinkedIn job description HTML correctly (regression)', async () => {
    const html = fs.readFileSync(
      path.join(__dirname, 'fixtures/linkedin-job-description.html'),
      'utf-8'
    );

    const dom = new JSDOM(html);
    const mockPage = {
      waitForSelector: vi.fn().mockResolvedValue(true),
      $eval: vi
        .fn()
        .mockImplementation((selector: string, fn: (el: Element) => string) => {
          const element = dom.window.document.querySelector(selector);
          if (!element) throw new Error('Element not found');

          // JSDom doesn't support innerText
          const mockElement = {
            ...element,
            innerText: element.textContent || '',
          } as unknown as HTMLElement;

          return Promise.resolve(fn(mockElement));
        }),
    } as unknown as Page;

    const description = await parseJobDescription(
      mockPage,
      LINKEDIN_DESCRIPTION_SELECTORS
    );

    expect(description).toBeTruthy();
    expect(description.length).toBeGreaterThan(100);
    expect(description).toContain('Senior Software Engineer');
    expect(description).toContain('5+ years of professional');

    const words = description.split(/\s+/);
    const longWords = words.filter((word) => word.length > 50);
    expect(longWords.length).toBe(0);
  });

  it('scrapes LinkedIn jobs end-to-end', async () => {
    const mockListPage = {
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(true),
      evaluate: vi.fn().mockResolvedValue([
        {
          title: 'Software Engineer',
          company: 'Tech Corp',
          location: 'San Francisco, CA',
          url: 'https://linkedin.com/jobs/view/123',
          description: '',
          source: 'linkedin',
        },
        {
          title: 'Senior Developer',
          company: 'StartupXYZ',
          location: 'Remote',
          url: 'https://linkedin.com/jobs/view/456',
          description: '',
          source: 'linkedin',
        },
      ]),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const mockDescPage1 = {
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(true),
      $eval: vi.fn().mockResolvedValue(MOCK_DESC_1),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const mockDescPage2 = {
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(true),
      $eval: vi.fn().mockResolvedValue(MOCK_DESC_2),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const mockBrowser = {
      newPage: vi
        .fn()
        .mockResolvedValueOnce(mockListPage)
        .mockResolvedValueOnce(mockDescPage1)
        .mockResolvedValueOnce(mockDescPage2),
    } as unknown as Browser;

    const results = await scrapeLinkedIn(
      mockBrowser,
      { jobTitle: 'software engineer', location: 'San Francisco' },
      2
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Software Engineer',
      company: 'Tech Corp',
      location: 'San Francisco, CA',
      source: 'linkedin',
    });
    expect(results[0]?.description).toContain('first description');
    expect(results[1]?.description).toContain('second description');

    expect(mockBrowser.newPage).toHaveBeenCalledTimes(3);
  });
});
