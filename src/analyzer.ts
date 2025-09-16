import OpenAI from 'openai';
import { logger } from './utils/logger.js';
import type { JobPosting, UserCriteria, AnalysisSummary } from './types.js';

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
Location: ${job.location}
Description: ${job.description || 'No description available'}
Source: ${job.source}

CANDIDATE CRITERIA:
Skills Required: ${userCriteria.requiredSkills?.join(', ') || 'Not specified'}
Experience Level: ${userCriteria.experienceLevel || 'Not specified'}
Location Preferences: ${userCriteria.locations?.join(', ') || 'Not specified'}
Remote Work Preference: ${userCriteria.remotePreference || 'Not specified'}

Please provide your analysis in the following JSON format:
{
  "score": <number 0-100>,
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
        analyzedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    logger.warn('Failed to parse AI response as JSON:', error);
  }

  // Fallback: extract score manually and use raw response
  const scoreMatch = response.match(/score[\"']?\s*:\s*(\d+)/i);
  const score = scoreMatch && scoreMatch[1] ? parseInt(scoreMatch[1], 10) : 0;

  return {
    ...job,
    score,
    analyzedAt: new Date().toISOString(),
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
    const prompt = buildAnalysisPrompt(job, userCriteria);

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            "You are an expert career advisor and job analyst. Your job is to analyze job postings and score them based on how well they match a candidate's criteria and preferences.",
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    return parseAnalysisResponse(response, job);
  } catch (error) {
    logger.error(`Error analyzing job ${job.title} at ${job.company}:`, error);
    return {
      ...job,
      score: 0,
      analyzedAt: new Date().toISOString(),
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
  batchSize: number = 5
): Promise<JobPosting[]> => {
  const analyzedJobs: JobPosting[] = [];

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);

    const batchPromises = batch.map((job) =>
      analyzeJob(openaiClient, job, userCriteria)
    );
    const batchResults = await Promise.all(batchPromises);

    analyzedJobs.push(...batchResults);

    // Add delay between batches to respect rate limits
    if (i + batchSize < jobs.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    logger.info(
      `Analyzed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        jobs.length / batchSize
      )}`
    );
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

/**
 * Generate a summary of the job analysis results
 */
export const generateAnalysisSummary = (
  analyzedJobs: JobPosting[]
): AnalysisSummary => {
  const totalJobs = analyzedJobs.length;
  const averageScore =
    totalJobs > 0
      ? analyzedJobs.reduce((sum, job) => sum + (job.score || 0), 0) / totalJobs
      : 0;

  const scoreDistribution = {
    excellent: analyzedJobs.filter((job) => (job.score || 0) >= 80).length,
    good: analyzedJobs.filter(
      (job) => (job.score || 0) >= 60 && (job.score || 0) < 80
    ).length,
    fair: analyzedJobs.filter(
      (job) => (job.score || 0) >= 40 && (job.score || 0) < 60
    ).length,
    poor: analyzedJobs.filter((job) => (job.score || 0) < 40).length,
  };

  const topJobs = analyzedJobs.slice(0, 10);

  return {
    totalJobs,
    averageScore: Math.round(averageScore),
    scoreDistribution,
    topJobs,
    analysisDate: new Date().toISOString(),
  };
};

export default {
  createOpenAIClient,
  buildAnalysisPrompt,
  parseAnalysisResponse,
  analyzeJob,
  analyzeJobsBatch,
  analyzeJobs,
  generateAnalysisSummary,
};
