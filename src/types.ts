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
  coreSkills: string[];
  remotePreference: string;
  excludedKeywords?: string[];
}

export interface AppConfig {
  jobCriteria: UserCriteria;
  logging: {
    level: string;
    file: string;
  };
}

export interface AppState {
  isRunning: boolean;
  transporter: any; // nodemailer.Transporter
}

// Utility types
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
