import cron from 'node-cron';
import { HfInference } from '@huggingface/inference';

import { createHuggingFaceClient } from './analyzer.js';
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
  weeklyRefreshJobs,
} from './database.js';
import { runWeeklyJobProcessing } from './scraper.js';
import { logger } from './utils/logger.js';

/**
 * Application state interface
 */
interface AppState {
  isRunning: boolean;
  hfClient: HfInference | null;
}

/**
 * Application state
 */
let appState: AppState = {
  isRunning: false,
  hfClient: null,
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

    // Initialize Hugging Face client
    appState.hfClient = createHuggingFaceClient(config.huggingFaceApiKey);

    logger.info('AI Job Hunter initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize AI Job Hunter:', error);
    throw error;
  }
};

/**
 * Run weekly job processing (scraping + analysis + saving)
 */
const runWeeklyJobs = async (): Promise<void> => {
  if (appState.isRunning) {
    logger.warn('Job process already in progress, skipping...');
    return;
  }

  appState.isRunning = true;
  const startTime = Date.now();

  try {
    logger.info('Starting weekly job processing...');

    const searchParams: SearchParams = getSearchParams();
    const processedCount = await runWeeklyJobProcessing(searchParams);

    logger.info(`Successfully processed ${processedCount} jobs`);

    const stats = await getDatabaseStats();
    logger.info('Database stats:', stats);

    const duration = (Date.now() - startTime) / 1000;
    logger.info(`Weekly job processing completed in ${duration}s`);
  } catch (error) {
    logger.error('Weekly job processing failed:', error);
    throw error;
  } finally {
    appState.isRunning = false;
  }
};

/**
 * Start the weekly job processing scheduler
 */
const startScheduler = (): void => {
  logger.info('Starting weekly job scheduler...');
  logger.info(`Schedule: ${config.schedule.scrapeExpression}`);
  logger.info(`Timezone: ${config.schedule.timezone}`);

  // Weekly: Job Processing (scraping + analysis + saving)
  cron.schedule(
    config.schedule.scrapeExpression,
    async () => {
      logger.info('Scheduled weekly job processing triggered');
      try {
        await runWeeklyJobs();
      } catch (error) {
        logger.error('Scheduled weekly job processing failed:', error);
      }
    },
    {
      timezone: config.schedule.timezone,
    }
  );

  logger.info('Weekly scheduler started successfully');
  logger.info('📅 Schedule:');
  logger.info(
    '  Weekly: Scrape jobs from LinkedIn + Google Jobs, analyze with AI, and save to database'
  );
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

    if (args.includes('--weekly')) {
      // Run weekly job processing
      await runWeeklyJobs();
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
  runWeeklyJobs,
  startScheduler,
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
