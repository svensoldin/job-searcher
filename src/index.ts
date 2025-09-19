import cron from 'node-cron';

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
import { runWeeklyJobProcessing } from './scraper.js';
import { logger } from './utils/logger.js';

/**
 * Application state interface
 */
interface AppState {
  isRunning: boolean;
}

/**
 * Application state
 */
let appState: AppState = {
  isRunning: false,
};

/**
 * Initialize all services
 */
const initializeServices = async (): Promise<void> => {
  try {
    console.log('🚀 Initializing AI Job Hunter...');

    // Validate configuration
    console.log('⚙️  Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated');

    // Connect to database
    console.log('🔌 Connecting to database...');
    await connectDatabase();
    console.log('✅ Database connected');

    console.log('🎉 AI Job Hunter initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize AI Job Hunter:', error);
    throw error;
  }
};

/**
 * Run weekly job processing (scraping + analysis + saving)
 */
const runWeeklyJobs = async (): Promise<void> => {
  if (appState.isRunning) {
    console.log('⚠️  Job process already in progress, skipping...');
    return;
  }

  appState.isRunning = true;
  const startTime = Date.now();

  try {
    console.log('🚀 Starting weekly job processing...');

    console.log('📝 Getting search parameters...');
    const searchParams: SearchParams = getSearchParams();
    console.log('🔍 Search params:', searchParams);

    console.log('🕷️  Starting job scraping and processing...');
    const processedCount = await runWeeklyJobProcessing(searchParams);

    console.log(`✅ Successfully processed ${processedCount} jobs`);

    console.log('📊 Getting database stats...');
    const stats = await getDatabaseStats();
    console.log('📈 Database stats:', stats);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`🎉 Weekly job processing completed in ${duration}s`);
  } catch (error) {
    console.error('❌ Weekly job processing failed:', error);
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
    console.log('📋 Command line arguments:', args);

    if (args.includes('--weekly')) {
      console.log('📅 Running weekly job processing...');
      // Run weekly job processing
      await runWeeklyJobs();
      console.log('🏁 Weekly job processing completed');
      process.exit(0);
    } else {
      // Scheduled mode (default)
      startScheduler();

      // Keep the process running
      console.log(
        'AI Job Hunter is running in scheduled mode. Press Ctrl+C to stop.'
      );

      // Handle graceful shutdown
      process.on('SIGINT', () => handleShutdown('SIGINT'));
      process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    }
  } catch (error) {
    console.error('Application failed to start:', error);
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
