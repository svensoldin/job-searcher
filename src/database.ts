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
 * Weekly refresh: Save jobs with URL-based persistence
 * - Drop records older than 1 week
 * - Preserve jobs with URLs that exist in new batch
 * - Add new jobs with scores
 */
export const weeklyRefreshJobs = async (
  jobs: JobPosting[]
): Promise<number> => {
  try {
    logger.info('Starting weekly job refresh...');

    // Get all existing URLs to preserve job history
    const existingUrls = new Set(await Job.distinct('url'));
    logger.info(`Found ${existingUrls.size} existing job URLs in database`);

    // Filter jobs: only keep new URLs
    const newJobs = jobs.filter((job) => !existingUrls.has(job.url));
    const preservedCount = jobs.length - newJobs.length;

    logger.info(
      `Jobs analysis: ${newJobs.length} new, ${preservedCount} already exist (preserved)`
    );

    // Drop old records (older than 1 week)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deleteResult = await Job.deleteMany({
      scraped_at: { $lt: oneWeekAgo },
      url: { $nin: jobs.map((j) => j.url) }, // Don't delete if URL is in new batch
    });

    logger.info(`Dropped ${deleteResult.deletedCount} old job records`);

    // Add new jobs if any
    if (newJobs.length > 0) {
      const jobsToInsert = newJobs.map((job) => ({
        ...job,
        hash: createJobHash(job),
        analysis_status: 'analyzed', // Jobs come pre-analyzed
        scraped_at: new Date(),
      }));

      await Job.insertMany(jobsToInsert);
      logger.info(`Inserted ${newJobs.length} new jobs`);
    }

    // Final stats
    const finalStats = await getDatabaseStats();
    logger.info('Weekly refresh complete:', finalStats);

    return newJobs.length;
  } catch (error) {
    logger.error('Weekly refresh failed:', error);
    throw error;
  }
};

/**
 * Remove duplicate jobs from database (cleanup function)
 */
export const removeDuplicateJobs = async (): Promise<number> => {
  try {
    logger.info('Starting duplicate job cleanup...');

    // Find all duplicate hashes
    const duplicates = await Job.aggregate([
      {
        $group: {
          _id: '$hash',
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', scraped_at: '$scraped_at' } },
        },
      },
      {
        $match: { count: { $gt: 1 } },
      },
    ]);

    if (duplicates.length === 0) {
      logger.info('No duplicate jobs found');
      return 0;
    }

    let removedCount = 0;

    // For each group of duplicates, keep the oldest one and remove the rest
    for (const duplicate of duplicates) {
      const docs = duplicate.docs.sort(
        (a: any, b: any) =>
          new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime()
      );

      // Remove all but the first (oldest) document
      const toRemove = docs.slice(1).map((doc: any) => doc.id);

      if (toRemove.length > 0) {
        await Job.deleteMany({ _id: { $in: toRemove } });
        removedCount += toRemove.length;
      }
    }

    logger.info(`Removed ${removedCount} duplicate jobs from database`);
    return removedCount;
  } catch (error) {
    logger.error('Failed to remove duplicate jobs:', error);
    return 0;
  }
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
 * Get jobs by score for viewing/analysis
 */
export const getJobsByScore = async (
  minScore: number = 60,
  limit: number = 50
): Promise<JobPosting[]> => {
  try {
    const jobs = await Job.find({
      analysis_status: 'analyzed',
      score: { $gte: minScore },
    })
      .sort({ score: -1, scraped_at: -1 })
      .limit(limit)
      .lean();

    logger.info(`Found ${jobs.length} jobs with score >= ${minScore}`);
    return jobs.map((job) => ({
      ...job,
      _id: job._id.toString(),
    }));
  } catch (error) {
    logger.error('Failed to get jobs by score:', error);
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

/**
 * Save a single job to database with deduplication
 */
export const saveJobToDatabase = async (job: JobPosting): Promise<boolean> => {
  try {
    const hash = createJobHash(job);

    // Check if job already exists
    const existingJob = await Job.findOne({ hash });
    if (existingJob) {
      logger.debug(`Job already exists: ${job.title} at ${job.company}`);
      return false;
    }

    // Save new job
    const jobToSave = {
      ...job,
      hash,
      analysis_status: 'analyzed',
      scraped_at: new Date(),
    };

    await Job.create(jobToSave);
    logger.info(
      `Saved job to database: ${job.title} at ${job.company} (Score: ${job.score})`
    );
    return true;
  } catch (error) {
    logger.error(`Failed to save job: ${job.title}`, error);
    return false;
  }
};

export default {
  Job,
  connectDatabase,
  disconnectDatabase,
  createJobHash,
  saveJobToDatabase,
  weeklyRefreshJobs,
  removeDuplicateJobs,
  getJobsByScore,
  getDatabaseStats,
};
