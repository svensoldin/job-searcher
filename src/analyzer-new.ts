import { logger } from './utils/logger.js';
import { config } from './config.js';
import {
  getJobsToAnalyze,
  updateJobAnalysis,
  markJobAnalysisFailed,
  saveJobToDatabase,
} from './database.js';
import { RuleBasedAnalyzer } from './analyzers/rule-based.js';
import type { JobPosting, UserCriteria } from './types.js';

/**
 * Analyze a single job posting using rule-based scoring (no external APIs)
 */
export const analyzeJob = async (
  job: JobPosting,
  userCriteria: UserCriteria
): Promise<JobPosting> => {
  try {
    logger.info(`Analyzing job: ${job.title} at ${job.company}`);

    // Use rule-based analysis (instant, no rate limits)
    const analyzedJob = RuleBasedAnalyzer.analyzeJob(job, userCriteria);

    logger.debug(
      `Analysis complete: ${job.title} - Score: ${analyzedJob.score}`
    );
    return analyzedJob;
  } catch (error) {
    logger.error(`Error analyzing job ${job.title} at ${job.company}:`, error);
    return {
      ...job,
      score: 0,
    };
  }
};

/**
 * Analyze jobs and save them incrementally
 */
export const analyzeAndSaveJobsIncremental = async (
  jobs: JobPosting[],
  userCriteria: UserCriteria
): Promise<{ analyzed: number; saved: number; failed: number }> => {
  let analyzed = 0;
  let saved = 0;
  let failed = 0;

  logger.info(`Starting rule-based analysis of ${jobs.length} jobs`);

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!job) continue;

    try {
      logger.info(`Analyzing job ${i + 1}/${jobs.length}: ${job.title}`);

      // Analyze the job (instant - no API calls)
      const analyzedJob = await analyzeJob(job, userCriteria);
      analyzed++;

      // Save immediately to database
      const wasSaved = await saveJobToDatabase(analyzedJob);
      if (wasSaved) {
        saved++;
      }

      logger.info(`✅ Completed ${job.title} - Score: ${analyzedJob.score}`);
    } catch (error) {
      failed++;
      logger.error(`❌ Failed to analyze job ${job.title}:`, error);

      // Save the job without analysis (score = 0) so we don't lose it
      try {
        await saveJobToDatabase({ ...job, score: 0 });
        saved++;
        logger.info(`💾 Saved failed job to database: ${job.title}`);
      } catch (saveError) {
        logger.error(`Failed to save failed job: ${job.title}`, saveError);
      }
    }
  }

  const results = { analyzed, saved, failed };
  logger.info(`📊 Rule-based analysis complete:`, results);
  return results;
};

/**
 * Analyze multiple jobs and return them sorted by score
 */
export const analyzeJobs = async (
  jobs: JobPosting[],
  userCriteria: UserCriteria,
  maxJobs: number = 50
): Promise<JobPosting[]> => {
  logger.info(`Starting rule-based analysis of ${jobs.length} jobs`);

  const jobsToAnalyze = jobs.slice(0, maxJobs);
  const analyzedJobs: JobPosting[] = [];

  // Process jobs (no rate limits with rule-based approach)
  for (let i = 0; i < jobsToAnalyze.length; i++) {
    const job = jobsToAnalyze[i];
    if (job) {
      logger.info(
        `Analyzing job ${i + 1}/${jobsToAnalyze.length}: ${job.title}`
      );
      const analyzedJob = await analyzeJob(job, userCriteria);
      analyzedJobs.push(analyzedJob);
    }
  }

  // Sort by score (highest first)
  const sortedJobs = analyzedJobs.sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );

  logger.info(`Analysis complete. Top score: ${sortedJobs[0]?.score || 0}`);
  return sortedJobs;
};

/**
 * Analyze pending jobs from database
 */
export const analyzePendingJobs = async (
  userCriteria: UserCriteria
): Promise<number> => {
  let analyzedCount = 0;

  try {
    // Get jobs to analyze
    const jobsToAnalyze = await getJobsToAnalyze(50); // No rate limits, so process more

    if (jobsToAnalyze.length === 0) {
      logger.info('No pending jobs to analyze');
      return 0;
    }

    logger.info(`Starting rule-based analysis of ${jobsToAnalyze.length} jobs`);

    // Analyze each job individually
    for (const job of jobsToAnalyze) {
      try {
        const analyzedJob = await analyzeJob(job, userCriteria);
        const score = analyzedJob.score || 0;

        if (job._id) {
          await updateJobAnalysis(job._id, score);
          analyzedCount++;
          logger.info(
            `Analyzed: ${job.title} at ${job.company} - Score: ${score}`
          );
        }
      } catch (error) {
        logger.error(`Failed to analyze job: ${job.title}`, error);

        if (job._id) {
          await markJobAnalysisFailed(job._id);
        }
      }
    }

    logger.info(`Analyzed ${analyzedCount} jobs successfully`);
    return analyzedCount;
  } catch (error) {
    logger.error('Daily analysis failed:', error);
    return analyzedCount;
  }
};

export default {
  analyzeJob,
  analyzeJobs,
  analyzeAndSaveJobsIncremental,
  analyzePendingJobs,
};
