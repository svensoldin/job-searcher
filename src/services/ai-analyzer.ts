import logger from '../utils/logger.js';
import { Mistral } from '@mistralai/mistralai';
import dotenv from 'dotenv';

import type { JobPosting, UserCriteria } from '../types.js';

dotenv.config();

const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) throw new Error('Missing MISTRAL_API_KEY');

const client = new Mistral({
  apiKey,
});

const MODEL = 'mistral-small-latest';

/**
 * Build AI prompt for job matching
 */
function buildAIPrompt(
  { skills, jobTitle, location, salary }: UserCriteria,
  jobDescription: string
): string {
  const skillsText = skills
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
    .join(', ');

  return `
Evaluate how well this job posting fits the user’s profile and give a score from 0–100.
User:

Title: ${jobTitle}

Skills: ${skillsText}

Location: ${location}

Desired salary: ${salary}
Job posting: ${jobDescription}
Consider:

Match between user’s title and the role.

Alignment of required and preferred skills.

Location or remote compatibility.

Salary fit (even if not specified, infer from context).

Overall relevance to the user’s background and experience level.

Output:
Score: X/100
`;
}

/**
 * Analyze a single job with AI
 */
async function analyzeJob(
  job: JobPosting,
  userCriteria: UserCriteria
): Promise<JobPosting> {
  try {
    logger.info(`🤖 Analyzing job: ${job.title} at ${job.company}`);

    const prompt = buildAIPrompt(userCriteria, job.description);

    const chatResponse = await client.chat.complete({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
    });

    let scoreText: string | null = null;
    const content = chatResponse.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      scoreText = content.trim();
    } else if (Array.isArray(content)) {
      scoreText = content
        .map((chunk) => (typeof chunk === 'string' ? chunk : ''))
        .join('')
        .trim();
    }

    logger.info(`📊 Raw AI response for "${job.title}": ${scoreText}`);

    // Extract score from response like "Score: 85/100" or just "85"
    let aiScore: number | null = null;
    if (scoreText) {
      // Try to extract number from various formats
      const scoreMatch = scoreText.match(/(\d+)(?:\/100)?/);
      if (scoreMatch && scoreMatch[1]) {
        aiScore = parseInt(scoreMatch[1], 10);
      }
    }

    logger.info(`✅ Final score for "${job.title}": ${aiScore}`);

    return { ...job, score: aiScore || 0 };
  } catch (error) {
    logger.error(`❌ Error analyzing job "${job.title}":`, error);
    return { ...job, score: 0 };
  }
}

/**
 * Analyze multiple jobs with AI and return top N sorted by score
 * Uses batching to avoid rate limits
 */
export async function analyzeAndRankJobs(
  jobs: JobPosting[],
  userCriteria: UserCriteria
): Promise<JobPosting[]> {
  logger.info(`Analyzing ${jobs.length} jobs with AI (Mistral)`);

  // Process jobs in batches to avoid rate limits
  const BATCH_SIZE = 5;
  const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds

  const analyzedJobs: JobPosting[] = [];

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    logger.info(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
        jobs.length / BATCH_SIZE
      )} (${batch.length} jobs)`
    );

    const batchResults = await Promise.all(
      batch.map((job) => analyzeJob(job, userCriteria))
    );

    analyzedJobs.push(...batchResults);

    // Add delay between batches (except for the last batch)
    if (i + BATCH_SIZE < jobs.length) {
      logger.info(`Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES)
      );
    }
  }

  const topJobs = analyzedJobs.sort((a, b) => (b.score || 0) - (a.score || 0));

  return topJobs;
}

export default { analyzeAndRankJobs };
