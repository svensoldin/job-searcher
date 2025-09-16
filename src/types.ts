/**
 * Core types for the AI Job Hunter application
 */

export interface JobPosting {
  title: string;
  company: string;
  url: string;
  description?: string;
  score?: number;
  // Database fields
  _id?: string;
  scraped_at?: Date;
  analysis_status?: 'pending' | 'analyzed' | 'failed';
  source?: string;
  hash?: string;
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

export interface EmailData {
  jobs: JobPosting[];
  totalJobs: number;
  date: string;
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
  openai: {
    model: string;
    maxTokens: number;
    requestsPerMinute: number;
    requestsPerDay: number;
    delayBetweenRequests: number;
  };
  logging: {
    level: string;
    file: string;
  };
}

export interface AppState {
  isRunning: boolean;
  transporter: any; // nodemailer.Transporter
  openaiClient: any; // OpenAI instance
}

// Utility types
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
