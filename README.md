# 🤖 Job Hunter

A job hunting agent that automatically searches for job postings, analyzes them according to the user's criteria, and stores them in MongoDB with weekly refresh cycles.

## ✨ Features

- **Automated Job Scraping**: Searches multiple job boards (LinkedIn, WTTJ) weekly
- **Rule-based Job Analysis**: Make your own custom rules in .env and score jobs accordingly
- **MongoDB Integration**: Efficient database storage with weekly refresh pattern
- **Modern Architecture**: TypeScript, MongoDB, simplified workflow

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB database

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd ai-job-hunter
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.template .env
   ```

   Edit `.env` and add your configuration:

   ```env

   # Job Search Criteria
   JOB_KEYWORDS=software engineer,developer,programmer
   JOB_LOCATIONS=Remote,New York,San Francisco
   CORE_SKILLS=JavaScript,Python,React
   ```

4. **Test the setup**

   ```bash
   npm run start -- --test
   ```

5. **Run a single job hunt**

   ```bash
   npm run start -- --run-once
   ```

6. **Start scheduled mode** (runs weekly)
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Job Search Criteria

Customize your job search in `.env`:

```env
# What roles to search for
JOB_KEYWORDS=software engineer,full stack developer,frontend developer

# Where you want to work
JOB_LOCATIONS=Remote,San Francisco,New York,Austin

# Your experience level
EXPERIENCE_LEVEL=Mid-level

# Must-have skills
CORE_SKILLS=JavaScript,React,Node.js

# Remote work preference
REMOTE_PREFERENCE=Remote preferred
```

### Scheduling

The default schedule runs every Monday at 9 AM. Customize in `.env`:

```env
# Cron expression (every Monday at 9 AM)
CRON_SCHEDULE=0 9 * * 1

# Your timezone
TIMEZONE=America/New_York
```

## License

MIT License
