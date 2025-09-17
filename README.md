# 🤖 AI Job Hunter

An intelligent job hunting agent that automatically searches for job postings, analyzes them using AI, and stores them in MongoDB with weekly refresh cycles.

## ✨ Features

- **Automated Job Scraping**: Searches multiple job boards (LinkedIn, Google Jobs) weekly
- **FREE AI Analysis**: Uses Hugging Face (FREE) for intelligent job scoring
- **MongoDB Integration**: Efficient database storage with weekly refresh pattern
- **Smart Filtering**: Ranks jobs by compatibility with your criteria
- **Heroku Ready**: Perfect for cloud deployment
- **Modern Architecture**: TypeScript, MongoDB, simplified workflow

## 🆓 AI Options

### Hugging Face (Recommended - FREE)

- ✅ **Completely FREE** - 1000 requests/month
- ✅ **No billing required**
- ✅ **Perfect for Heroku**
- ✅ **Good quality analysis**

### OpenAI (Legacy - Paid)

- ❌ Requires paid account
- ❌ Costs money per request
- ✅ Slightly better quality

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- FREE Hugging Face account ([setup guide](./HUGGING_FACE_SETUP.md))
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
   # OpenAI API Configuration
   OPENAI_API_KEY=your_openai_api_key_here

   # Email Configuration
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_app_password_here
   USER_EMAIL=your_email@gmail.com

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

### OpenAI API Setup

1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Add it to your `.env` file as `OPENAI_API_KEY`

### Email Setup (Gmail)

1. Enable 2-factor authentication on your Gmail account
2. Generate an [App Password](https://support.google.com/accounts/answer/185833)
3. Use your Gmail address and the app password in `.env`

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

# Nice-to-have skills
PREFERRED_SKILLS=TypeScript,AWS,Docker

# Industry preferences
INDUSTRIES=Technology,Fintech,Healthcare

# Company size preference
COMPANY_SIZE=Startup

# Remote work preference
REMOTE_PREFERENCE=Remote preferred

# Salary expectations
SALARY_RANGE=$80,000 - $120,000

# Career goals
CAREER_GOALS=Professional growth and challenging work in a collaborative environment
```

### Scheduling

The default schedule runs every Monday at 9 AM. Customize in `.env`:

```env
# Cron expression (every Monday at 9 AM)
CRON_SCHEDULE=0 9 * * 1

# Your timezone
TIMEZONE=America/New_York
```

## 📁 Project Structure

```
ai-job-hunter/
├── src/
│   ├── index.js          # Main application entry point
│   ├── scraper.js        # Job scraping functionality
│   ├── analyzer.js       # AI job analysis
│   ├── emailer.js        # Email service
│   ├── config.js         # Configuration management
│   └── utils/
│       └── logger.js     # Logging utility
├── templates/
│   └── job-report.hbs    # Email template
├── tests/                # Test files
├── logs/                 # Application logs
├── package.json
├── .env.template         # Environment template
└── README.md
```

## 🎯 How It Works

1. **Weekly Trigger**: The app runs on a schedule (default: Monday 9 AM)

2. **Job Scraping**: Searches multiple job boards based on your keywords and location

3. **AI Analysis**: Each job posting is analyzed by GPT-4 considering:

   - Technical skill alignment
   - Experience level match
   - Location preferences
   - Industry fit
   - Career goals alignment

4. **Scoring**: Jobs are scored 0-100 and categorized:

   - **Excellent** (80+): Perfect matches
   - **Good** (60-79): Strong candidates
   - **Fair** (40-59): Possible fits
   - **Poor** (<40): Not recommended

5. **Email Report**: You receive a beautiful HTML email with:
   - Search summary and statistics
   - Top 10 job matches
   - Detailed analysis for each job
   - Direct links to apply

## 🔧 Usage

### Command Line Options

```bash
# Run tests
npm run start -- --test

# Run once (manual trigger)
npm run start -- --run-once

# Start scheduled mode (default)
npm start

# Development mode with auto-restart
npm run dev
```

### Monitoring

Check logs for application activity:

```bash
# View recent logs
tail -f logs/combined.log

# View errors only
tail -f logs/error.log
```

## 🛠️ Development

### Code Style

The project uses ESLint for code quality:

```bash
# Check code style
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Architecture

This project follows modern functional JavaScript patterns:

- **Pure Functions**: All core logic is implemented as pure functions
- **Immutable Data**: State is managed immutably
- **Modular Design**: Each file has a single responsibility
- **Async/Await**: Modern async patterns throughout
- **Error Handling**: Comprehensive error handling and logging

## 🔍 Troubleshooting

### Common Issues

**"Failed to initialize browser"**

- Install Chrome/Chromium: `brew install chromium` (macOS)
- Or install via package manager on Linux

**"OpenAI API Error"**

- Check your API key is correct
- Ensure you have credits in your OpenAI account
- Verify the API key has the right permissions

**"Email sending failed"**

- Use an app password, not your regular password
- Enable 2-factor authentication on Gmail
- Check firewall/network restrictions

**"No jobs found"**

- Try broader search keywords
- Expand location preferences
- Check if job boards are accessible from your network

### Debug Mode

Enable verbose logging:

```env
LOG_LEVEL=debug
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built with Node.js and modern JavaScript
- Uses OpenAI GPT-4 for intelligent job analysis
- Email templates powered by Handlebars
- Web scraping with Puppeteer

---

**Happy job hunting! 🎯**

## Setup

1. Clone this repository
2. Create a virtual environment: `python -m venv venv`
3. Activate the virtual environment: `source venv/bin/activate` (macOS/Linux) or `venv\Scripts\activate` (Windows)
4. Install dependencies: `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and configure your settings
6. Run the agent: `python -m job_hunter`

## Configuration

Configure your job search criteria in the `.env` file:

- Job titles and keywords
- Location preferences
- Salary requirements
- Company preferences
- AI scoring weights
- Email settings

## Usage

- **Manual run**: `python -m job_hunter.main`
- **Weekly schedule**: The agent can be configured to run automatically
- **Test mode**: `python -m job_hunter.main --test`

## License

MIT License
