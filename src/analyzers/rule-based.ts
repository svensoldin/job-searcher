import { logger } from '../utils/logger.js';
import type { JobPosting, UserCriteria } from '../types.js';

/**
 * Create skill variations for better matching
 */
function createSkillGroups(skills: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  for (const skill of skills) {
    const key = skill.toLowerCase();
    groups[key] = [key];

    // Add common variations
    if (key === 'react') groups[key].push('reactjs', 'react.js');
    if (key === 'vue') groups[key].push('vuejs', 'vue.js');
    if (key === 'angular') groups[key].push('angularjs');
    if (key === 'node') groups[key].push('nodejs', 'node.js');
    if (key === 'typescript') groups[key].push('ts');
    if (key === 'javascript') groups[key].push('js', 'es6', 'es2015');
    if (key === 'python') groups[key].push('py');
    if (key === 'docker') groups[key].push('containerization');
    if (key === 'kubernetes') groups[key].push('k8s');
    if (key === 'aws') groups[key].push('amazon web services');
  }

  return groups;
}

/**
 * Score based on required skills matching (40 points max)
 */
function scoreSkills(
  job: JobPosting,
  coreSkills: string[]
): { score: number; reasons: string[] } {
  if (!coreSkills.length)
    return { score: 15, reasons: ['No specific skills required'] };

  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const reasons: string[] = [];
  let matchedSkills = 0;

  // Define skill groups with variations
  const skillGroups = createSkillGroups(coreSkills);

  for (const skill of coreSkills) {
    const variations = skillGroups[skill.toLowerCase()] || [
      skill.toLowerCase(),
    ];
    const isMatch = variations.some((variation) => jobText.includes(variation));

    if (isMatch) {
      matchedSkills++;
      reasons.push(`✓ ${skill}`);
    }
  }

  let score = 0;

  if (matchedSkills > 2) {
    score = 40;
  } else if (matchedSkills === 0) {
    score = 0;
  } else if (matchedSkills <= 2) {
    score = 30;
  }

  return { score, reasons };
}

/**
 * Score based on experience level (30 points max)
 */
function scoreExperienceLevel(
  job: JobPosting,
  preferredLevel?: string
): { score: number; reasons: string[] } {
  if (!preferredLevel)
    return { score: 15, reasons: ['No experience preference'] };

  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const reasons: string[] = [];

  const levelMappings = {
    junior: ['junior', 'entry', 'graduate', '0-2 years', 'new grad'],
    mid: ['mid', 'intermediate', '2-5 years', '3-5 years', 'experienced'],
    senior: ['senior', 'lead', '5+ years', '7+ years', 'expert', 'principal'],
  };

  const targetLevel = preferredLevel.toLowerCase();
  const targetTerms = levelMappings[
    targetLevel as keyof typeof levelMappings
  ] || [targetLevel];

  const hasMatch = targetTerms.some((term) => jobText.includes(term));
  const hasConflict = Object.entries(levelMappings)
    .filter(([level]) => level !== targetLevel)
    .some(([, terms]) => terms.some((term) => jobText.includes(term)));

  let score = 15; // Default score
  if (hasMatch) {
    score = 30;
    reasons.push(`✓ Matches ${preferredLevel} level`);
  } else if (hasConflict) {
    score = 8;
    reasons.push(`⚠ Different experience level detected`);
  }

  return { score, reasons };
}

/**
 * Score based on location and remote preferences (30 points max)
 */
function scoreLocation(
  job: JobPosting,
  criteria: UserCriteria
): { score: number; reasons: string[] } {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const reasons: string[] = [];
  let score = 15; // Default score

  // Check for remote work
  if (
    criteria.remotePreference === 'remote' ||
    criteria.remotePreference === 'hybrid'
  ) {
    const remoteTerms = [
      'remote',
      'work from home',
      'wfh',
      'distributed',
      'anywhere',
    ];
    const hasRemote = remoteTerms.some((term) => jobText.includes(term));

    if (hasRemote) {
      score = 30;
      reasons.push('✓ Remote work available');
    }
  }

  // Check location preferences
  if (criteria.locations?.length) {
    const hasLocationMatch = criteria.locations.some((location) =>
      jobText.includes(location.toLowerCase())
    );

    if (hasLocationMatch) {
      score = Math.max(score, 25);
      reasons.push('✓ Preferred location');
    }
  }

  return { score, reasons };
}

/**
 * Deduct points for excluded keywords
 */
function scoreExclusions(
  job: JobPosting,
  criteria: UserCriteria
): { score: number; reasons: string[] } {
  const excludedKeywords = criteria.excludedKeywords || [];
  if (!excludedKeywords.length) return { score: 0, reasons: [] };

  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const reasons: string[] = [];
  let penalty = 0;

  for (const keyword of excludedKeywords) {
    if (jobText.includes(keyword.toLowerCase())) {
      penalty -= 10;
      reasons.push(`✗ Contains excluded: ${keyword}`);
    }
  }

  return { score: penalty, reasons };
}

/**
 * Bonus points for premium features (10 points max)
 */
function scoreBonusFeatures(job: JobPosting): {
  score: number;
  reasons: string[];
} {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const reasons: string[] = [];
  let bonus = 0;

  const premiumIndicators = [
    {
      terms: ['equity', 'stock options', 'rsu'],
      points: 3,
      label: 'Equity offered',
    },
    {
      terms: ['unlimited pto', 'flexible time off'],
      points: 3,
      label: 'Flexible PTO',
    },
    {
      terms: ['learning budget', 'conference', 'training'],
      points: 2,
      label: 'Learning opportunities',
    },
  ];

  for (const indicator of premiumIndicators) {
    const hasFeature = indicator.terms.some((term) => jobText.includes(term));
    if (hasFeature) {
      bonus += indicator.points;
      reasons.push(`✓ ${indicator.label}`);
    }
  }

  return { score: Math.min(bonus, 10), reasons };
}

/**
 * Analyze job posting using rule-based scoring
 * New scoring distribution:
 * - Skills: 30 points max
 * - Experience Level: 30 points max
 * - Location/Remote: 30 points max
 * - Bonus Features: 10 points max
 * - Exclusions: -10 points each
 */
export function analyzeJob(
  job: JobPosting,
  criteria: UserCriteria
): JobPosting {
  let score = 0;
  const reasons: string[] = [];

  // 1. Required Skills Matching (30 points max)
  const skillScore = scoreSkills(job, criteria.coreSkills || []);
  score += skillScore.score;
  reasons.push(...skillScore.reasons);

  // 2. Experience Level Matching (30 points max)
  const expScore = scoreExperienceLevel(job, criteria.experienceLevel);
  score += expScore.score;
  reasons.push(...expScore.reasons);

  // 3. Location/Remote Preference (30 points max)
  const locationScore = scoreLocation(job, criteria);
  score += locationScore.score;
  reasons.push(...locationScore.reasons);

  // 4. Exclude negative keywords (deduct points)
  const excludeScore = scoreExclusions(job, criteria);
  score += excludeScore.score;
  reasons.push(...excludeScore.reasons);

  // 5. Bonus points for premium indicators (10 points max)
  const bonusScore = scoreBonusFeatures(job);
  score += bonusScore.score;
  reasons.push(...bonusScore.reasons);

  // Ensure score is between 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    ...job,
    score: Math.round(score),
  };
}

// Export individual functions for testing
export {
  scoreSkills,
  scoreExperienceLevel,
  scoreLocation,
  scoreExclusions,
  scoreBonusFeatures,
};

// Keep backward compatibility with the class-based approach
export const RuleBasedAnalyzer = {
  analyzeJob,
};

export default { analyzeJob };
