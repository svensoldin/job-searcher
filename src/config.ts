import dotenv from 'dotenv';
import type {
  AppConfig,
  UserCriteria,
  EmailConfig,
  UserInfo,
} from './types.js';

// Load environment variables
dotenv.config();

// Helper function to parse boolean environment variables
const parseBoolean = (value: string | undefined): boolean => {
  return value === 'true';
};

// Helper function to parse integer environment variables with fallback
const parseInteger = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
};

// Helper function to parse comma-separated strings
const parseArray = (value: string | undefined): string[] => {
  return value ? value.split(',').map((item) => item.trim()) : [];
};

/**
 * Email configuration
 */
export const emailConfig: EmailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInteger(process.env.EMAIL_PORT, 587),
  secure: parseBoolean(process.env.EMAIL_SECURE),
  user: process.env.EMAIL_USER || '',
  password: process.env.EMAIL_PASSWORD || '',
  from: process.env.EMAIL_FROM || process.env.EMAIL_USER || '',
};

/**
 * User information
 */
export const userInfo: UserInfo = {
  email: process.env.USER_EMAIL || '',
  name: process.env.USER_NAME || 'Job Hunter',
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
  requiredSkills: parseArray(process.env.CORE_SKILLS),
  remotePreference: process.env.REMOTE_PREFERENCE || 'Remote preferred',
};

/**
 * Application configuration
 */
export const config: AppConfig = {
  // AI API configuration
  openaiApiKey: process.env.OPENAI_API_KEY || '', // Keep for legacy compatibility
  huggingFaceApiKey: process.env.HUGGING_FACE_API_KEY || '',

  // Email configuration
  email: emailConfig,

  // User preferences and job search criteria
  user: userInfo,
  jobCriteria,

  // Scheduling configuration (Dual Schedule)
  schedule: {
    scrapeExpression: process.env.CRON_SCHEDULE_SCRAPE || '0 9 * * 1', // Monday scraping
    analyzeExpression: process.env.CRON_SCHEDULE_ANALYZE || '0 9 * * 2-5', // Tue-Fri analysis
    timezone: process.env.TIMEZONE || 'America/New_York',
  },

  // Scraping configuration
  scraping: {
    maxJobs: parseInteger(process.env.MAX_JOBS, 100),
    delayBetweenRequests: parseInteger(process.env.DELAY_MS, 1000),
    timeout: parseInteger(process.env.TIMEOUT_MS, 30000),
  },

  // Analysis configuration
  analysis: {
    maxJobsToAnalyze: parseInteger(process.env.MAX_ANALYZE, 3),
    batchSize: parseInteger(process.env.ANALYSIS_BATCH_SIZE, 1),
    scoreThreshold: parseInteger(process.env.SCORE_THRESHOLD, 60),
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/job-hunter.log',
  },
};

/**
 * Required configuration fields
 */
const REQUIRED_FIELDS = ['huggingFaceApiKey'] as const;

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const missing: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const keys = field.split('.');
    let value: any = config;

    for (const key of keys) {
      value = value?.[key];
    }

    if (!value) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
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
    location: config.jobCriteria.locations[0] || 'Remote', // Use first location for search
    experienceLevel: config.jobCriteria.experienceLevel,
  };
}

/**
 * Environment check
 */
export function checkEnvironment(): boolean {
  try {
    validateConfig();
    return true;
  } catch (error) {
    console.error('Environment validation failed:', error);
    return false;
  }
}

export default config;
