import nodemailer, { Transporter } from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import handlebars from 'handlebars';
import { logger } from './utils/logger.js';
import { getJobsByScore } from './database.js';
import type { JobPosting, EmailConfig, EmailData } from './types.js';

/**
 * Create and initialize email transporter
 */
export const createEmailTransporter = async (
  emailConfig: EmailConfig
): Promise<Transporter> => {
  try {
    const transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.password,
      },
    });

    // Verify connection
    await transporter.verify();
    logger.info('Email service initialized successfully');
    return transporter;
  } catch (error) {
    logger.error('Failed to initialize email service:', error);
    throw error;
  }
};

/**
 * Load and compile email template
 */
export const loadTemplate = async (
  templateName: string
): Promise<HandlebarsTemplateDelegate> => {
  try {
    const templatePath = path.join(
      process.cwd(),
      'templates',
      `${templateName}.hbs`
    );
    const templateContent = await fs.readFile(templatePath, 'utf8');
    return handlebars.compile(templateContent);
  } catch (error) {
    logger.error(`Failed to load template ${templateName}:`, error);
    throw error;
  }
};

/**
 * Format job data for email template
 */
export const formatJobsForEmail = (jobs: JobPosting[]): EmailData => {
  return {
    jobs: jobs.slice(0, 10), // Get top 10 jobs
    totalJobs: jobs.length,
    date: new Date().toLocaleDateString(),
  };
};

/**
 * Generate plain text version of the email
 */
export const generateTextVersion = (emailData: EmailData): string => {
  let text = `AI Job Hunter - Weekly Report\n`;
  text += `=====================================\n\n`;
  text += `Total jobs found: ${emailData.totalJobs}\n`;
  text += `Report date: ${emailData.date}\n\n`;

  if (emailData.jobs.length > 0) {
    text += `Job Matches:\n`;
    text += `============\n\n`;

    emailData.jobs.forEach((job, index) => {
      text += `${index + 1}. ${job.title} at ${job.company}\n`;
      if (job.score) {
        text += `   Score: ${job.score}/100\n`;
      }
      text += `   URL: ${job.url}\n`;
      if (job.description) {
        const shortDesc = job.description.substring(0, 200) + '...';
        text += `   Description: ${shortDesc}\n`;
      }
      text += `\n`;
    });
  } else {
    text += `No jobs found matching your criteria.\n`;
    text += `Consider adjusting your search parameters.\n`;
  }

  text += `\nReport generated on ${emailData.date}\n`;
  text += `Happy job hunting!\n`;

  return text;
};

/**
 * Send job hunting report email
 */
export const sendJobReport = async (
  transporter: Transporter,
  jobs: JobPosting[],
  userEmail: string,
  emailConfig: EmailConfig
): Promise<any> => {
  try {
    const template = await loadTemplate('job-report-simple');
    const emailData = formatJobsForEmail(jobs);

    const htmlContent = template(emailData);

    const mailOptions = {
      from: {
        name: 'AI Job Hunter',
        address: emailConfig.from,
      },
      to: userEmail,
      subject: `Weekly Job Report - ${emailData.totalJobs} Jobs Found`,
      html: htmlContent,
      text: generateTextVersion(emailData),
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Job report email sent successfully to ${userEmail}`);
    return result;
  } catch (error) {
    logger.error('Failed to send job report email:', error);
    throw error;
  }
};

/**
 * Send test email to verify configuration
 */
export const sendTestEmail = async (
  transporter: Transporter,
  userEmail: string,
  emailConfig: EmailConfig
): Promise<any> => {
  try {
    const mailOptions = {
      from: {
        name: 'AI Job Hunter',
        address: emailConfig.from,
      },
      to: userEmail,
      subject: 'AI Job Hunter - Test Email',
      html: `
        <h2>AI Job Hunter Test Email</h2>
        <p>Congratulations! Your email configuration is working correctly.</p>
        <p>You will receive weekly job reports at this email address.</p>
        <p><strong>Test sent on:</strong> ${new Date().toLocaleString()}</p>
      `,
      text: `AI Job Hunter Test Email\n\nCongratulations! Your email configuration is working correctly.\nYou will receive weekly job reports at this email address.\n\nTest sent on: ${new Date().toLocaleString()}`,
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Test email sent successfully to ${userEmail}`);
    return result;
  } catch (error) {
    logger.error('Failed to send test email:', error);
    throw error;
  }
};

/**
 * Send notification about errors or issues
 */
export const sendErrorNotification = async (
  transporter: Transporter,
  error: Error,
  userEmail: string,
  emailConfig: EmailConfig
): Promise<any> => {
  try {
    const mailOptions = {
      from: {
        name: 'AI Job Hunter',
        address: emailConfig.from,
      },
      to: userEmail,
      subject: 'AI Job Hunter - Error Notification',
      html: `
        <h2>AI Job Hunter Error Notification</h2>
        <p>An error occurred during your job search:</p>
        <p><strong>Error:</strong> ${error.message}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p>Please check your configuration and try again.</p>
      `,
      text: `AI Job Hunter Error Notification\n\nAn error occurred during your job search:\nError: ${
        error.message
      }\nTime: ${new Date().toLocaleString()}\n\nPlease check your configuration and try again.`,
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Error notification sent to ${userEmail}`);
    return result;
  } catch (emailError) {
    logger.error('Failed to send error notification:', emailError);
  }
};

/**
 * Send email with best analyzed jobs from database
 */
export const sendBestJobsEmail = async (
  transporter: Transporter,
  userEmail: string,
  emailConfig: EmailConfig,
  maxJobs: number = 10
): Promise<void> => {
  try {
    logger.info('Fetching best jobs from database...');

    const bestJobs = await getJobsByScore(maxJobs);

    if (bestJobs.length === 0) {
      logger.info('No analyzed jobs with good scores found');
      return;
    }

    logger.info(`Sending email with ${bestJobs.length} best jobs`);

    const emailData = formatJobsForEmail(bestJobs);

    await sendJobReport(transporter, bestJobs, userEmail, emailConfig);

    logger.info(`Best jobs email sent successfully to ${userEmail}`);
  } catch (error) {
    logger.error('Failed to send best jobs email:', error);
    throw error;
  }
};

export default {
  createEmailTransporter,
  loadTemplate,
  formatJobsForEmail,
  generateTextVersion,
  sendJobReport,
  sendTestEmail,
  sendErrorNotification,
  sendBestJobsEmail,
};
