import mongoose from 'mongoose';
import crypto from 'crypto';
import { logger } from './utils/logger.js';
import type { JobPosting } from './types.js';

/**
 * Simple MongoDB job schema
 */
const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  url: { type: String, required: true },
  description: { type: String, default: '' },
  score: { type: Number, default: null },
  scraped_at: { type: Date, default: Date.now },
  analysis_status: {
    type: String,
    enum: ['pending', 'analyzed', 'failed'],
    default: 'pending',
  },
  source: { type: String, required: true },
  hash: { type: String, required: true, unique: true },
});

// Index for faster queries
jobSchema.index({ analysis_status: 1, scraped_at: -1 });
jobSchema.index({ hash: 1 });

export const Job = mongoose.model('Job', jobSchema);

/**
 * Connect to MongoDB
 */
export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) {
      throw new Error('MONGO_URL environment variable is required');
    }

    await mongoose.connect(mongoUrl);
    logger.info('Connected to MongoDB successfully');
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
};

/**
 * Disconnect from MongoDB
 */
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB:', error);
  }
};

/**
 * Create a unique hash for job deduplication
 */
export const createJobHash = (job: JobPosting): string => {
  const content = `${job.title}-${job.company}-${job.url}`;
  return crypto.createHash('md5').update(content.toLowerCase()).digest('hex');
};

/**
 * Save jobs to database (skip duplicates)
 */
export const saveJobs = async (jobs: JobPosting[]): Promise<number> => {
  let savedCount = 0;

  for (const job of jobs) {
    try {
      const hash = createJobHash(job);

      // Check if job already exists
      const existingJob = await Job.findOne({ hash });
      if (existingJob) {
        logger.debug(`Job already exists: ${job.title} at ${job.company}`);
        continue;
      }

      // Save new job
      await Job.create({
        ...job,
        hash,
        analysis_status: 'pending',
      });

      savedCount++;
      logger.debug(`Saved job: ${job.title} at ${job.company}`);
    } catch (error) {
      logger.error(`Failed to save job: ${job.title}`, error);
    }
  }

  logger.info(`Saved ${savedCount} new jobs to database`);
  return savedCount;
};

/**
 * Get jobs that need analysis (limit for daily processing)
 */
export const getJobsToAnalyze = async (
  limit: number = 8
): Promise<JobPosting[]> => {
  try {
    const jobs = await Job.find({ analysis_status: 'pending' })
      .sort({ scraped_at: -1 }) // Newest first
      .limit(limit)
      .lean();

    logger.info(`Found ${jobs.length} jobs to analyze`);
    return jobs.map((job) => ({
      ...job,
      _id: job._id.toString(),
    }));
  } catch (error) {
    logger.error('Failed to get jobs for analysis:', error);
    return [];
  }
};

/**
 * Update job with analysis results
 */
export const updateJobAnalysis = async (
  jobId: string,
  score: number
): Promise<void> => {
  try {
    await Job.findByIdAndUpdate(jobId, {
      score,
      analysis_status: 'analyzed',
    });

    logger.debug(`Updated job analysis: ${jobId} with score ${score}`);
  } catch (error) {
    logger.error(`Failed to update job analysis: ${jobId}`, error);
  }
};

/**
 * Mark job analysis as failed
 */
export const markJobAnalysisFailed = async (jobId: string): Promise<void> => {
  try {
    await Job.findByIdAndUpdate(jobId, {
      analysis_status: 'failed',
    });

    logger.debug(`Marked job analysis as failed: ${jobId}`);
  } catch (error) {
    logger.error(`Failed to mark job as failed: ${jobId}`, error);
  }
};

/**
 * Get best analyzed jobs for email
 */
export const getBestJobs = async (
  limit: number = 10
): Promise<JobPosting[]> => {
  try {
    const jobs = await Job.find({
      analysis_status: 'analyzed',
      score: { $gte: 60 }, // Only jobs with good scores
    })
      .sort({ score: -1, scraped_at: -1 }) // Best score first, then newest
      .limit(limit)
      .lean();

    logger.info(`Found ${jobs.length} best jobs for email`);
    return jobs.map((job) => ({
      ...job,
      _id: job._id.toString(),
    }));
  } catch (error) {
    logger.error('Failed to get best jobs:', error);
    return [];
  }
};

/**
 * Get database stats
 */
export const getDatabaseStats = async (): Promise<{
  total: number;
  pending: number;
  analyzed: number;
  failed: number;
}> => {
  try {
    const [total, pending, analyzed, failed] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ analysis_status: 'pending' }),
      Job.countDocuments({ analysis_status: 'analyzed' }),
      Job.countDocuments({ analysis_status: 'failed' }),
    ]);

    return { total, pending, analyzed, failed };
  } catch (error) {
    logger.error('Failed to get database stats:', error);
    return { total: 0, pending: 0, analyzed: 0, failed: 0 };
  }
};

export default {
  Job,
  connectDatabase,
  disconnectDatabase,
  createJobHash,
  saveJobs,
  getJobsToAnalyze,
  updateJobAnalysis,
  markJobAnalysisFailed,
  getBestJobs,
  getDatabaseStats,
};
