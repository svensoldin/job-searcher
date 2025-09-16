/**
 * Core types for the AI Job Hunter application
 */

export interface JobPosting {
  title: string;
  company: string;
  location: string;
  url: string;
  source: 'LinkedIn' | 'Indeed' | string;
  dateFound: string;
  description?: string;
  score?: number;
  analyzedAt?: string;
}

export interface SearchParams {
  keywords: string;
  location: string;
  experienceLevel?: string;
  maxResults?: number;
}

export interface UserCriteria {
  keywords: string[];
  locations: string[];
  experienceLevel: string;
  requiredSkills: string[];
  remotePreference: string;
}

export interface UserInfo {
  email: string;
  name: string;
}

export interface AnalysisSummary {
  totalJobs: number;
  averageScore: number;
  scoreDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  topJobs: JobPosting[];
  analysisDate: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface AppConfig {
  openaiApiKey: string;
  email: EmailConfig;
  user: UserInfo;
  jobCriteria: UserCriteria;
  schedule: {
    cronExpression: string;
    timezone: string;
  };
  scraping: {
    maxJobs: number;
    delayBetweenRequests: number;
    timeout: number;
  };
  analysis: {
    maxJobsToAnalyze: number;
    batchSize: number;
    scoreThreshold: number;
  };
  logging: {
    level: string;
    file: string;
  };
}

export interface EmailData {
  summary: {
    totalJobs: number;
    averageScore: number;
    excellent: number;
    good: number;
    fair: number;
    poor: number;
    date: string;
  };
  topJobs: Array<{
    title: string;
    company: string;
    location: string;
    source: string;
    url: string;
    score: number;
  }>;
  hasJobs: boolean;
}

export interface AppState {
  isRunning: boolean;
  transporter: any; // nodemailer.Transporter
  openaiClient: any; // OpenAI instance
}

// Utility types
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type JobScore = 'excellent' | 'good' | 'fair' | 'poor';
export type CommandLineArgs = '--test' | '--run-once';
