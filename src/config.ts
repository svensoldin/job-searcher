import dotenv from 'dotenv';
import type { AppConfig, UserCriteria } from './types.js';

dotenv.config();

// Helper function to parse comma-separated strings
const parseArray = (value: string | undefined): string[] => {
  return value ? value.split(',').map((item) => item.trim()) : [];
};

/**
 * Job search criteria
 */
export const jobCriteria: UserCriteria = {
  keywords:
    parseArray(process.env.JOB_KEYWORDS).length > 0
      ? parseArray(process.env.JOB_KEYWORDS)
      : ['software engineer'],
  locations:
    parseArray(process.env.JOB_LOCATIONS).length > 0
      ? parseArray(process.env.JOB_LOCATIONS)
      : ['Remote'],
  experienceLevel: process.env.EXPERIENCE_LEVEL || 'Mid-level',
  coreSkills: parseArray(process.env.CORE_SKILLS),
  remotePreference: process.env.REMOTE_PREFERENCE || 'Remote preferred',
  excludedKeywords: parseArray(process.env.EXCLUDED_KEYWORDS),
};

/**
 * Application configuration
 */
export const config: AppConfig = {
  jobCriteria,
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/job-hunter.log',
  },
};

export function validateConfig(): void {
  // No required fields for rule-based analysis
  console.log('Configuration validation passed - using rule-based analyzer');
}

/**
 * Search parameters interface
 */
export interface SearchParams {
  keywords: string;
  location: string;
  experienceLevel: string;
}

/**
 * Get search parameters for job scraping
 */
export function getSearchParams(): SearchParams {
  return {
    keywords: config.jobCriteria.keywords.join(' '),
    location: config.jobCriteria.locations[0] || 'Remote',
    experienceLevel: config.jobCriteria.experienceLevel,
  };
}

export default config;
