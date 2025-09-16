import cron from 'node-cron';
import { Transporter } from 'nodemailer';
import OpenAI from 'openai';

import {
  analyzeJobs,
  analyzePendingJobs,
  createOpenAIClient,
} from './analyzer.js';
import {
  config,
  getSearchParams,
  validateConfig,
  SearchParams,
} from './config.js';
import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStats,
} from './database.js';
import {
  createEmailTransporter,
  sendErrorNotification,
  sendJobReport,
  sendTestEmail,
  sendBestJobsEmail,
} from './emailer.js';
import { searchJobs, scrapeAndSaveJobs } from './scraper.js';
import { logger } from './utils/logger.js';
import type { JobPosting } from './types.js';

/**
 * Application state interface
 */
interface AppState {
  isRunning: boolean;
  transporter: Transporter | null;
  openaiClient: OpenAI | null;
}

/**
 * Application state
 */
let appState: AppState = {
  isRunning: false,
  transporter: null,
  openaiClient: null,
};

/**
 * Initialize all services
 */
const initializeServices = async (): Promise<void> => {
  try {
    logger.info('Initializing AI Job Hunter...');

    // Validate configuration
    validateConfig();

    // Connect to database
    await connectDatabase();

    // Initialize services
    appState.openaiClient = createOpenAIClient(config.openaiApiKey);
    appState.transporter = await createEmailTransporter(config.email);

    logger.info('AI Job Hunter initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize AI Job Hunter:', error);
    throw error;
  }
};

/**
 * Send report when no jobs are found
 */
const sendEmptyReport = async (): Promise<void> => {
  const subject = 'Weekly Job Report - No Jobs Found';
  const text = 'No jobs were found matching your criteria this week.';

  logger.info('Sending empty job report');
  // This would require creating a simple email function for empty reports
  // For now, we'll just log it
};

/**
 * Scrape jobs and save to database (weekly)
 */
const runJobScraping = async (): Promise<void> => {
  if (appState.isRunning) {
    logger.warn('Job process already in progress, skipping...');
    return;
  }

  appState.isRunning = true;
  const startTime = Date.now();

  try {
    logger.info('Starting job scraping process...');

    const searchParams: SearchParams = getSearchParams();
    const savedCount = await scrapeAndSaveJobs(searchParams);

    if (savedCount === 0) {
      logger.warn('No new jobs found or saved');
    } else {
      logger.info(`Successfully saved ${savedCount} new jobs to database`);
    }

    const stats = await getDatabaseStats();
    logger.info('Database stats:', stats);

    const duration = (Date.now() - startTime) / 1000;
    logger.info(`Job scraping completed in ${duration}s`);
  } catch (error) {
    logger.error('Job scraping failed:', error);
    throw error;
  } finally {
    appState.isRunning = false;
  }
};

/**
 * Analyze pending jobs and send email (daily)
 */
const runDailyAnalysis = async (): Promise<void> => {
  if (appState.isRunning) {
    logger.warn('Job process already in progress, skipping...');
    return;
  }

  appState.isRunning = true;
  const startTime = Date.now();

  try {
    logger.info('Starting daily job analysis...');

    if (!appState.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    // Analyze pending jobs
    const analyzedCount = await analyzePendingJobs(
      appState.openaiClient,
      config.jobCriteria
    );

    if (analyzedCount > 0) {
      logger.info(`Analyzed ${analyzedCount} jobs`);

      // Send email with best jobs
      if (appState.transporter) {
        await sendBestJobsEmail(
          appState.transporter,
          config.user.email,
          config.email,
          10
        );
      }
    } else {
      logger.info('No jobs were analyzed today');
    }

    const duration = (Date.now() - startTime) / 1000;
    logger.info(`Daily analysis completed in ${duration}s`);
  } catch (error) {
    logger.error('Daily analysis failed:', error);

    // Send error notification
    try {
      if (appState.transporter && error instanceof Error) {
        await sendErrorNotification(
          appState.transporter,
          error,
          config.user.email,
          config.email
        );
      }
    } catch (emailError) {
      logger.error('Failed to send error notification:', emailError);
    }

    throw error;
  } finally {
    appState.isRunning = false;
  }
};

/**
 * Send email with best analyzed jobs
 */

/**
 * Run the complete job hunting process
 */
const runJobHunt = async (): Promise<void> => {
  if (appState.isRunning) {
    logger.warn('Job hunt already in progress, skipping...');
    return;
  }

  appState.isRunning = true;
  const startTime = Date.now();

  try {
    logger.info('Starting job hunt process...');

    // Step 1: Search for jobs
    logger.info('Step 1: Searching for jobs...');
    const searchParams: SearchParams = getSearchParams();
    const jobs: JobPosting[] = await searchJobs(searchParams);

    if (jobs.length === 0) {
      logger.warn('No jobs found, sending empty report');
      await sendEmptyReport();
      return;
    }

    logger.info(`Found ${jobs.length} jobs`);

    // Step 2: Analyze jobs with AI
    logger.info('Step 2: Analyzing jobs with AI...');
    if (!appState.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const analyzedJobs: JobPosting[] = await analyzeJobs(
      appState.openaiClient,
      jobs,
      config.jobCriteria,
      config.analysis.maxJobsToAnalyze
    );

    // Step 3: Send email report
    logger.info('Step 3: Sending email report...');
    if (!appState.transporter) {
      throw new Error('Email transporter not initialized');
    }

    await sendJobReport(
      appState.transporter,
      analyzedJobs,
      config.user.email,
      config.email
    );

    const duration = (Date.now() - startTime) / 1000;
    logger.info(`Job hunt completed successfully in ${duration}s`);

    // Log summary statistics
    logger.info('Job hunt summary:', {
      totalJobs: jobs.length,
      analyzedJobs: analyzedJobs.length,
      topScore: analyzedJobs[0]?.score || 0,
    });
  } catch (error) {
    logger.error('Job hunt failed:', error);

    // Send error notification
    try {
      if (appState.transporter && error instanceof Error) {
        await sendErrorNotification(
          appState.transporter,
          error,
          config.user.email,
          config.email
        );
      }
    } catch (emailError) {
      logger.error('Failed to send error notification:', emailError);
    }

    throw error;
  } finally {
    appState.isRunning = false;
  }
};

/**
 * Start the dual scheduled job hunting (scraping + analysis)
 */
const startScheduler = (): void => {
  logger.info('Starting dual scheduler...');
  logger.info(`Scraping schedule: ${config.schedule.scrapeExpression}`);
  logger.info(`Analysis schedule: ${config.schedule.analyzeExpression}`);
  logger.info(`Timezone: ${config.schedule.timezone}`);

  // Monday: Job Scraping
  cron.schedule(
    config.schedule.scrapeExpression,
    async () => {
      logger.info('Scheduled job scraping triggered (Monday)');
      try {
        await runJobScraping();
      } catch (error) {
        logger.error('Scheduled job scraping failed:', error);
      }
    },
    {
      timezone: config.schedule.timezone,
    }
  );

  // Tuesday-Friday: Job Analysis
  cron.schedule(
    config.schedule.analyzeExpression,
    async () => {
      logger.info('Scheduled job analysis triggered (Tue-Fri)');
      try {
        await runDailyAnalysis();
      } catch (error) {
        logger.error('Scheduled job analysis failed:', error);
      }
    },
    {
      timezone: config.schedule.timezone,
    }
  );

  logger.info('Dual scheduler started successfully');
  logger.info('📅 Schedule:');
  logger.info('  Monday 9 AM: Scrape jobs from LinkedIn + Indeed');
  logger.info('  Tue-Fri 9 AM: Analyze 8 pending jobs + send email');
};

/**
 * Test result interface
 */
interface TestResult {
  job: string;
  score?: number | undefined;
}

/**
 * Run a test to verify all components work
 */
const runTest = async (): Promise<void> => {
  try {
    logger.info('Running test...');

    if (!appState.transporter) {
      throw new Error('Email transporter not initialized');
    }

    // Test email service
    await sendTestEmail(appState.transporter, config.user.email, config.email);

    // Test job search (limited)
    const searchParams: SearchParams = getSearchParams();
    const testJobs: JobPosting[] = await searchJobs(searchParams);

    logger.info(`Test completed - found ${testJobs.length} test jobs`);

    if (testJobs.length > 0 && appState.openaiClient) {
      // Test analysis on one job
      const firstJob = testJobs[0];
      if (firstJob) {
        const testAnalysis: JobPosting[] = await analyzeJobs(
          appState.openaiClient,
          [firstJob],
          config.jobCriteria,
          1
        );

        const testResult: TestResult = {
          job: firstJob.title,
          score: testAnalysis[0]?.score,
        };

        logger.info('Test analysis completed:', testResult);
      }
    }

    logger.info('All tests passed!');
  } catch (error) {
    logger.error('Test failed:', error);
    throw error;
  }
};

/**
 * Handle graceful shutdown
 */
const handleShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await disconnectDatabase();
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }

  process.exit(0);
};

/**
 * Main application entry point
 */
const main = async (): Promise<void> => {
  try {
    await initializeServices();

    // Parse command line arguments
    const args: string[] = process.argv.slice(2);

    if (args.includes('--test')) {
      // Run test mode
      await runTest();
    } else if (args.includes('--run-once')) {
      // Run once mode (legacy)
      await runJobHunt();
    } else if (args.includes('--scrape')) {
      // Scrape jobs and save to database
      await runJobScraping();
    } else if (args.includes('--analyze')) {
      // Analyze pending jobs from database
      await runDailyAnalysis();
    } else {
      // Scheduled mode (default)
      startScheduler();

      // Keep the process running
      logger.info(
        'AI Job Hunter is running in scheduled mode. Press Ctrl+C to stop.'
      );

      // Handle graceful shutdown
      process.on('SIGINT', () => handleShutdown('SIGINT'));
      process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    }
  } catch (error) {
    logger.error('Application failed to start:', error);
    process.exit(1);
  }
};

// Export functions for testing
export {
  initializeServices,
  runJobHunt,
  runJobScraping,
  runDailyAnalysis,
  startScheduler,
  runTest,
  handleShutdown,
  main,
};

// Run the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
