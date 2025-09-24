import { createBrowser, closeBrowser, getJobDescription } from './dist/scraper.js';
import { logger } from './dist/utils/logger.js';

const testWelcomeToTheJungleDescription = async () => {
  logger.info('🧪 Testing Welcome to the Jungle job description fetching...');
  
  try {
    const browser = await createBrowser();
    
    // Test with a Welcome to the Jungle job URL (we'll use a generic one)
    const testUrl = 'https://www.welcometothejungle.com/fr/companies/airbus/jobs/software-engineer_toulouse';
    
    logger.info(`📄 Testing job description fetch for: ${testUrl}`);
    const description = await getJobDescription(browser, testUrl);
    
    if (description && description.length > 50) {
      logger.info(`✅ Successfully fetched description (${description.length} characters)`);
      logger.info(`📖 Description preview: ${description.substring(0, 200)}...`);
    } else {
      logger.warn(`❌ Failed to fetch description or description too short (${description.length} characters)`);
      logger.info(`📖 Raw output: "${description}"`);
    }
    
    await closeBrowser(browser);
    return description.length > 0;
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    return false;
  }
};

testWelcomeToTheJungleDescription()
  .then(success => {
    logger.info(`🎯 Test complete: ${success ? 'SUCCESS' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    logger.error('❌ Test error:', error);
    process.exit(1);
  });