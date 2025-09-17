import { InferenceClient } from '@huggingface/inference';
import { logger } from './utils/logger.js';
import {
  getJobsToAnalyze,
  updateJobAnalysis,
  markJobAnalysisFailed,
} from './database.js';
import type { JobPosting, UserCriteria } from './types.js';

/**
 * Rate limiter to track Hugging Face API usage
 */
class RateLimiter {
  private dailyRequests: number = 0;
  private minuteRequests: number = 0;
  private lastMinuteReset: number = Date.now();
  private lastDayReset: number = Date.now();

  async checkRateLimit(): Promise<void> {
    const now = Date.now();

    // Reset minute counter if a minute has passed
    if (now - this.lastMinuteReset >= 60000) {
      this.minuteRequests = 0;
      this.lastMinuteReset = now;
    }

    // Reset daily counter if a day has passed
    if (now - this.lastDayReset >= 24 * 60 * 60 * 1000) {
      this.dailyRequests = 0;
      this.lastDayReset = now;
    }

    // Hugging Face free tier: 1000 requests/month (~33/day), 10/minute
    if (this.minuteRequests >= 10) {
      const waitTime = 60000 - (now - this.lastMinuteReset);
      logger.info('Minute rate limit reached, waiting...');
      await new Promise((resolve) => setTimeout(resolve, waitTime + 1000));
      this.minuteRequests = 0;
      this.lastMinuteReset = Date.now();
    }

    if (this.dailyRequests >= 33) {
      const waitTime = 24 * 60 * 60 * 1000 - (now - this.lastDayReset);
      logger.warn('Daily rate limit reached, waiting until tomorrow...');
      await new Promise((resolve) => setTimeout(resolve, waitTime + 1000));
      this.dailyRequests = 0;
      this.lastDayReset = Date.now();
    }

    this.minuteRequests++;
    this.dailyRequests++;

    logger.info(
      `Hugging Face API usage: ${this.minuteRequests}/10 per minute, ${this.dailyRequests}/33 per day`
    );
  }
}

const rateLimiter = new RateLimiter();

/**
 * Create Hugging Face client
 */
export const createHuggingFaceClient = (apiKey: string): InferenceClient => {
  return new InferenceClient(apiKey);
};

/**
 * Build the analysis prompt for the AI
 */
export const buildAnalysisPrompt = (
  job: JobPosting,
  userCriteria: UserCriteria
): string => {
  return `
Please analyze this job posting and score it from 0-100 based on how well it matches the candidate's criteria:

JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description || 'No description available'}

CANDIDATE CRITERIA:
Skills Required: ${userCriteria.requiredSkills?.join(', ') || 'Not specified'}
Experience Level: ${userCriteria.experienceLevel || 'Not specified'}
Location Preferences: ${userCriteria.locations?.join(', ') || 'Not specified'}
Remote Work Preference: ${userCriteria.remotePreference || 'Not specified'}

Please provide only a JSON response with a score:
{
  "score": <number 0-100>
}

Consider factors like:
- Technical skill alignment
- Experience level appropriateness
- Location and remote work alignment
`;
};

/**
 * Parse the AI response and extract structured data
 */
export const parseAnalysisResponse = (
  response: string,
  job: JobPosting
): JobPosting => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]) as { score: number };
      return {
        ...job,
        score: analysis.score || 0,
      };
    }
  } catch (error) {
    logger.warn('Failed to parse AI response as JSON:', error);
  }

  // Fallback: extract score manually
  const scoreMatch = response.match(/score[\"']?\s*:\s*(\d+)/i);
  const score = scoreMatch && scoreMatch[1] ? parseInt(scoreMatch[1], 10) : 0;

  return {
    ...job,
    score,
  };
};

/**
 * Analyze a single job posting and return a score
 */
export const analyzeJob = async (
  hfClient: InferenceClient,
  job: JobPosting,
  userCriteria: UserCriteria
): Promise<JobPosting> => {
  try {
    // Check rate limits before making the request
    await rateLimiter.checkRateLimit();

    const prompt = buildAnalysisPrompt(job, userCriteria);

    logger.info(`Analyzing job: ${job.title} at ${job.company}`);

    // Use Hugging Face's chat completion model
    const response = await hfClient.chatCompletion({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      messages: [
        {
          role: 'user',
          content: `You are an expert career advisor with software developers. Analyze this job posting and provide a score from 0-100 based on how well it matches the criteria.

${prompt}

Respond with JSON format: {"score": 85 }`,
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    const responseText = response.choices?.[0]?.message?.content?.trim();
    if (!responseText) {
      throw new Error('No response from Hugging Face');
    }

    const result = parseAnalysisResponse(responseText, job);

    // Add delay between requests to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 6000)); // 6 seconds for 10/minute limit

    return result;
  } catch (error) {
    logger.error(`Error analyzing job ${job.title} at ${job.company}:`, error);
    return {
      ...job,
      score: 0,
    };
  }
};

/**
 * Process jobs in batches to avoid rate limits
 */
export const analyzeJobsBatch = async (
  hfClient: InferenceClient,
  jobs: JobPosting[],
  userCriteria: UserCriteria,
  batchSize: number = 1
): Promise<JobPosting[]> => {
  const analyzedJobs: JobPosting[] = [];

  // Process jobs sequentially to respect rate limits
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (job) {
      logger.info(`Analyzing job ${i + 1}/${jobs.length}: ${job.title}`);
      const analyzedJob = await analyzeJob(hfClient, job, userCriteria);
      analyzedJobs.push(analyzedJob);
    }
  }

  return analyzedJobs;
};

/**
 * Analyze multiple jobs and return them sorted by score
 */
export const analyzeJobs = async (
  hfClient: InferenceClient,
  jobs: JobPosting[],
  userCriteria: UserCriteria,
  maxJobs: number = 50
): Promise<JobPosting[]> => {
  logger.info(`Starting analysis of ${jobs.length} jobs`);

  const jobsToAnalyze = jobs.slice(0, maxJobs);
  const analyzedJobs = await analyzeJobsBatch(
    hfClient,
    jobsToAnalyze,
    userCriteria
  );

  // Sort by score (highest first)
  const sortedJobs = analyzedJobs.sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );

  logger.info(`Analysis complete. Top score: ${sortedJobs[0]?.score || 0}`);

  return sortedJobs;
};

/**
 * Analyze pending jobs from database (daily limit: 8-9 jobs)
 */
export const analyzePendingJobs = async (
  hfClient: InferenceClient,
  userCriteria: UserCriteria
): Promise<number> => {
  const rateLimiter = new RateLimiter();
  let analyzedCount = 0;

  try {
    // Get jobs to analyze (8 jobs to stay well under daily limit)
    const jobsToAnalyze = await getJobsToAnalyze(8);

    if (jobsToAnalyze.length === 0) {
      logger.info('No pending jobs to analyze');
      return 0;
    }

    logger.info(`Starting daily analysis of ${jobsToAnalyze.length} jobs`);

    // Analyze each job individually
    for (const job of jobsToAnalyze) {
      try {
        await rateLimiter.checkRateLimit();

        const analyzedJob = await analyzeJob(hfClient, job, userCriteria);
        const score = analyzedJob.score || 0;

        if (job._id) {
          await updateJobAnalysis(job._id, score);
          analyzedCount++;
          logger.info(
            `Analyzed: ${job.title} at ${job.company} - Score: ${score}`
          );
        }

        // Wait between requests (6 seconds for Hugging Face)
        await new Promise((resolve) => setTimeout(resolve, 6000));
      } catch (error) {
        logger.error(`Failed to analyze job: ${job.title}`, error);

        if (job._id) {
          await markJobAnalysisFailed(job._id);
        }
      }
    }

    logger.info(`Daily analysis complete. Analyzed ${analyzedCount} jobs`);
    return analyzedCount;
  } catch (error) {
    logger.error('Daily analysis failed:', error);
    throw error;
  }
};

export default {
  createHuggingFaceClient,
  buildAnalysisPrompt,
  parseAnalysisResponse,
  analyzeJob,
  analyzeJobsBatch,
  analyzeJobs,
  analyzePendingJobs,
};
