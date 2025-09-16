import OpenAI from 'openai';
import { logger } from './utils/logger.js';
import { config } from './config.js';
import type { JobPosting, UserCriteria } from './types.js';

/**
 * Rate limiter to track OpenAI API usage
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

    // Check if we've exceeded limits
    if (this.dailyRequests >= config.openai.requestsPerDay) {
      throw new Error(
        `Daily OpenAI request limit reached (${config.openai.requestsPerDay})`
      );
    }

    if (this.minuteRequests >= config.openai.requestsPerMinute) {
      logger.info('Minute rate limit reached, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 60000));
      this.minuteRequests = 0;
      this.lastMinuteReset = Date.now();
    }

    this.minuteRequests++;
    this.dailyRequests++;

    logger.info(
      `OpenAI API usage: ${this.minuteRequests}/${config.openai.requestsPerMinute} per minute, ${this.dailyRequests}/${config.openai.requestsPerDay} per day`
    );
  }
}

const rateLimiter = new RateLimiter();

/**
 * Create OpenAI client
 */
export const createOpenAIClient = (apiKey: string): OpenAI => {
  return new OpenAI({ apiKey });
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
 * Analyze a single job posting and return a score with reasoning
 */
export const analyzeJob = async (
  openaiClient: OpenAI,
  job: JobPosting,
  userCriteria: UserCriteria
): Promise<JobPosting> => {
  try {
    // Check rate limits before making the request
    await rateLimiter.checkRateLimit();

    const prompt = buildAnalysisPrompt(job, userCriteria);

    logger.info(`Analyzing job: ${job.title} at ${job.company}`);

    const completion = await openaiClient.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content:
            "You are an expert career advisor and job analyst for developers. Your job is to analyze job postings and score them based on how well they match a candidate's criteria and preferences.",
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: config.openai.maxTokens,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const result = parseAnalysisResponse(response, job);

    // Add delay between requests to respect rate limits
    await new Promise((resolve) =>
      setTimeout(resolve, config.openai.delayBetweenRequests)
    );

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
  openaiClient: OpenAI,
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
      const analyzedJob = await analyzeJob(openaiClient, job, userCriteria);
      analyzedJobs.push(analyzedJob);
    }
  }

  return analyzedJobs;
};

/**
 * Analyze multiple jobs and return them sorted by score
 */
export const analyzeJobs = async (
  openaiClient: OpenAI,
  jobs: JobPosting[],
  userCriteria: UserCriteria,
  maxJobs: number = 50
): Promise<JobPosting[]> => {
  logger.info(`Starting analysis of ${jobs.length} jobs`);

  const jobsToAnalyze = jobs.slice(0, maxJobs);
  const analyzedJobs = await analyzeJobsBatch(
    openaiClient,
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

export default {
  createOpenAIClient,
  buildAnalysisPrompt,
  parseAnalysisResponse,
  analyzeJob,
  analyzeJobsBatch,
  analyzeJobs,
};
