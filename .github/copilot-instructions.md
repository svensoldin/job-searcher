<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# AI Job Hunting Agent - Copilot Instructions

This project is an AI-powered job hunting agent built with Node.js that:

- Searches for job postings weekly based on user criteria
- Analyzes job postings using AI to score relevance and fit
- Sends curated email reports with top job matches

## Project Structure

- Node.js/JavaScript-based project with web scraping, AI analysis, and email automation
- TypeScript for better type safety and development experience
- Modular design with separate components for scraping, analysis, and notifications
- Scheduled execution for weekly job hunting automation

## Development Guidelines

- Follow JavaScript/TypeScript best practices and ESLint configuration
- Use modern ES6+ features and async/await for asynchronous operations
- Implement proper error handling and logging
- Write unit tests using Jest for core functionality
- Use environment variables for sensitive configuration (API keys, email credentials)
- Use npm for package management

## Key Technologies

- Web scraping (Puppeteer, Cheerio, Playwright)
- AI analysis (OpenAI API, Anthropic Claude, or similar)
- Email automation (Nodemailer, email templates)
- Task scheduling (node-cron, agenda)
- Configuration management (dotenv, config)
- TypeScript for type safety
- Jest for testing
