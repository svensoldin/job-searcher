import { JobPosting, UserCriteria } from '../../types.js';
import { RuleBasedAnalyzer } from '../rule-based.js';

const mockJob: JobPosting = {
  description: `
About the job

About the company

Trust Wallet is the leading non-custodial cryptocurrency wallet, trusted by over 200 million people worldwide to securely manage and grow their digital assets. Our vision is to give individuals the freedom to own their assets, confidently participate in the future economy, and access opportunities that enhance their lives. Our mission is to be a trusted personal companion — helping users safely navigate Web3, the on-chain economy, and the emerging AI-powered future. With support for over 10 million assets across 100+ blockchains, Trust Wallet offers a seamless, multi-chain experience backed by industry-leading self-custody technology, a vibrant community, and a growing ecosystem of partners.



The Opportunity

We are seeking a Frontend Engineer to own the end-to-end development of a browser extension. The role involves collaborating with design, backend, and product teams to deliver new features, driving technical discussions for architectural improvements, and maintaining high code quality and performance.


Responsibilities

    Own feature development end-to-end for the browser extension
    Collaborate with design, backend and product to deliver new features
    Drive technical discussions and propose architectural improvements
    Maintain a high standard of code quality and performance


Qualifications

    Bachelor's degree in CS or equivalent experience
    3+ years of experience building frontend applications
    Strong proficiency in React, Typescript and modern CSS practices
    Proficient English communication skills
    Self-driven comfortable in fast-paced, remote-first environments
    Product oriented mindset with a passion for performance



Nice to have

    Professional Blockchain experience
    Familiarity with Web3 concepts (Wallets, signing, smart contracts)


Additional Information

You must have the right to work for the country you are based. 


Why work at Trust Wallet?

    Be a part of the world's leading blockchain ecosystem that continues to grow and offers excellent career development opportunities.
    Work alongside diverse, world-class talent, in an environment where learning and growth opportunities are endless.
    Tackle fast-paced, challenging and unique projects.
    Work in a truly global organization, with international teams and a flat organizational structure.
    Enjoy competitive salary and benefits.
    Balance life and work with flexible working hours and casual work attire


Apply today to join our team in building the world's most trusted and secure crypto wallet and enable a decentralized future for everyone.


*Due to the large amount of the applications, please take your application unsuccessful should you not be contacted within 4 weeks from your application date.
`,
  title: 'Frontend Developer',
  company: 'Trust Wallet',
  url: 'https://example.com/job/123',
};

describe('RuleBasedAnalyzer', () => {
  describe('analyzeJob', () => {
    it('should score high for matching React/TypeScript skills', () => {
      const criteria: UserCriteria = {
        keywords: ['frontend', 'react'],
        locations: ['remote'],
        experienceLevel: 'mid',
        coreSkills: ['React', 'TypeScript', 'JavaScript'],
        remotePreference: 'remote',
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      expect(result.score).toBeGreaterThan(50); // Job matches React, TypeScript, and frontend keywords
      expect(result.title).toBe('Frontend Developer');
      expect(result.company).toBe('Trust Wallet');
    });

    it('should score medium for partial skill match', () => {
      const criteria: UserCriteria = {
        keywords: ['backend'],
        locations: ['new york'],
        experienceLevel: 'senior',
        coreSkills: ['Python', 'Django', 'PostgreSQL'], // No match with React/TS job
        remotePreference: 'onsite',
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      expect(result.score).toBeLessThan(50);
    });

    it('should score high for experience level match', () => {
      const criteria: UserCriteria = {
        keywords: ['frontend'],
        locations: [],
        experienceLevel: 'mid', // Job requires "3+ years" which matches mid-level
        coreSkills: ['React', 'TypeScript'],
        remotePreference: 'remote',
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      expect(result.score).toBeGreaterThan(60);
    });

    it('should handle remote work preference correctly', () => {
      const criteria: UserCriteria = {
        keywords: ['frontend'],
        locations: [],
        experienceLevel: 'mid',
        coreSkills: ['React'],
        remotePreference: 'remote',
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      // Job mentions "remote-first environments" so should get remote bonus
      expect(result.score).toBeGreaterThan(50);
    });

    it('should apply exclusion penalties', () => {
      const criteria: UserCriteria = {
        keywords: ['frontend'],
        locations: [],
        experienceLevel: 'mid',
        coreSkills: ['React', 'TypeScript'],
        remotePreference: 'remote',
        excludedKeywords: ['blockchain'], // Job is blockchain-related
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      // Should be penalized for blockchain keyword
      const criteriaWithoutExclusion: UserCriteria = {
        ...criteria,
        excludedKeywords: [],
      };
      const resultWithoutExclusion = RuleBasedAnalyzer.analyzeJob(
        mockJob,
        criteriaWithoutExclusion
      );

      expect(result.score).toBeLessThan(resultWithoutExclusion.score!);
    });

    it('should give bonus points for premium features', () => {
      const criteria: UserCriteria = {
        keywords: ['frontend'],
        locations: [],
        experienceLevel: 'mid',
        coreSkills: ['React'],
        remotePreference: 'remote',
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      // Job mentions "competitive salary and benefits" and "flexible working hours"
      // Should get some bonus points
      expect(result.score).toBeGreaterThan(40);
    });

    it('should ensure score is within 0-100 range', () => {
      const criteria: UserCriteria = {
        keywords: ['frontend'],
        locations: [],
        experienceLevel: 'junior',
        coreSkills: ['React', 'TypeScript', 'JavaScript', 'CSS'],
        remotePreference: 'remote',
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.score)).toBe(true);
    });

    it('should handle empty or minimal criteria', () => {
      const criteria: UserCriteria = {
        keywords: [],
        locations: [],
        experienceLevel: '',
        coreSkills: [],
        remotePreference: '',
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should preserve original job data', () => {
      const criteria: UserCriteria = {
        keywords: ['frontend'],
        locations: [],
        experienceLevel: 'mid',
        coreSkills: ['React'],
        remotePreference: 'remote',
      };

      const result = RuleBasedAnalyzer.analyzeJob(mockJob, criteria);

      expect(result.title).toBe(mockJob.title);
      expect(result.company).toBe(mockJob.company);
      expect(result.description).toBe(mockJob.description);
      expect(result.url).toBe(mockJob.url);
      expect(result).toHaveProperty('score');
    });
  });

  describe('skill variations', () => {
    it('should match React variations', () => {
      const jobWithReactJS: JobPosting = {
        ...mockJob,
        description:
          'Looking for a ReactJS developer with experience in modern frontend frameworks',
      };

      const criteria: UserCriteria = {
        keywords: [],
        locations: [],
        experienceLevel: '',
        coreSkills: ['React'],
        remotePreference: '',
      };

      const result = RuleBasedAnalyzer.analyzeJob(jobWithReactJS, criteria);
      expect(result.score).toBeGreaterThan(20); // Should get points for React match
    });

    it('should match TypeScript variations', () => {
      const jobWithTS: JobPosting = {
        ...mockJob,
        description:
          'We need someone with TS experience and strong JavaScript skills',
      };

      const criteria: UserCriteria = {
        keywords: [],
        locations: [],
        experienceLevel: '',
        coreSkills: ['TypeScript'],
        remotePreference: '',
      };

      const result = RuleBasedAnalyzer.analyzeJob(jobWithTS, criteria);
      expect(result.score).toBeGreaterThan(20); // Should get points for TS match
    });
  });
});
