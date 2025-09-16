import cron from 'node-cron';
import { Transporter } from 'nodemailer';
import OpenAI from 'openai';

import {
  analyzeJobs,
  createOpenAIClient,
  generateAnalysisSummary,
} from './analyzer.js';
import {
  config,
  getSearchParams,
  validateConfig,
  SearchParams,
} from './config.js';
import {
  createEmailTransporter,
  sendErrorNotification,
  sendJobReport,
  sendTestEmail,
} from './emailer.js';
import { searchJobs } from './scraper.js';
import { logger } from './utils/logger.js';
import type { JobPosting, AnalysisSummary } from './types.js';

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
 * Job hunt statistics interface
 */
interface JobHuntStats {
  totalJobs: number;
  analyzedJobs: number;
  averageScore: number;
  topScore: number;
  excellentMatches: number;
}

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

    // Step 3: Generate summary
    logger.info('Step 3: Generating analysis summary...');
    const summary: AnalysisSummary = generateAnalysisSummary(analyzedJobs);

    // Step 4: Send email report
    logger.info('Step 4: Sending email report...');
    if (!appState.transporter) {
      throw new Error('Email transporter not initialized');
    }

    await sendJobReport(
      appState.transporter,
      analyzedJobs,
      summary,
      config.user.email,
      config.email
    );

    const duration = (Date.now() - startTime) / 1000;
    logger.info(`Job hunt completed successfully in ${duration}s`);

    // Log summary statistics
    const stats: JobHuntStats = {
      totalJobs: jobs.length,
      analyzedJobs: analyzedJobs.length,
      averageScore: summary.averageScore,
      topScore: analyzedJobs[0]?.score || 0,
      excellentMatches: summary.scoreDistribution.excellent,
    };

    logger.info('Job hunt summary:', stats);
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
 * Start the scheduled job hunting
 */
const startScheduler = (): void => {
  logger.info(
    `Starting scheduler with cron expression: ${config.schedule.cronExpression}`
  );

  cron.schedule(
    config.schedule.cronExpression,
    async () => {
      logger.info('Scheduled job hunt triggered');
      try {
        await runJobHunt();
      } catch (error) {
        logger.error('Scheduled job hunt failed:', error);
      }
    },
    {
      timezone: config.schedule.timezone,
    }
  );

  logger.info('Scheduler started successfully');
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
const handleShutdown = (signal: string): void => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
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
      // Run once mode
      await runJobHunt();
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
