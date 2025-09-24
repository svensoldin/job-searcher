import { createBrowser, closeBrowser, scrapeWelcomeToTheJungle, enrichJobsWithDescriptions } from './dist/scraper.js';
import { logger } from './dist/utils/logger.js';

const testWelcomeToTheJungleFlow = async () => {
  console.log('🧪 Testing Welcome to the Jungle complete flow...');
  
  try {
    const browser = await createBrowser();
    
    // Step 1: Scrape jobs from Welcome to the Jungle
    console.log('📝 Step 1: Scraping jobs from Welcome to the Jungle...');
    const searchParams = {
      keywords: 'frontend developer',
      location: 'France',
      experienceLevel: 'mid'
    };

    const jobs = await scrapeWelcomeToTheJungle(browser, searchParams);
    console.log(`✅ Scraped ${jobs.length} jobs from Welcome to the Jungle`);
    
    if (jobs.length === 0) {
      console.log('❌ No jobs found, stopping test');
      await closeBrowser(browser);
      return false;
    }

    // Step 2: Test job description fetching for the first few jobs
    console.log('📖 Step 2: Testing job description fetching...');
    const testJobs = jobs.slice(0, 3); // Test first 3 jobs only
    const enrichedJobs = await enrichJobsWithDescriptions(browser, testJobs);
    
    // Step 3: Analyze results
    console.log('\n📊 Results:');
    let successCount = 0;
    
    enrichedJobs.forEach((job, index) => {
      const hasDescription = job.description && job.description.length > 50;
      console.log(`${index + 1}. ${job.title} at ${job.company}`);
      console.log(`   URL: ${job.url}`);
      console.log(`   Description: ${hasDescription ? `✅ ${job.description.length} chars` : '❌ Missing or too short'}`);
      if (hasDescription) {
        console.log(`   Preview: ${job.description.substring(0, 100)}...`);
        successCount++;
      }
      console.log('');
    });
    
    console.log(`🎯 Success rate: ${successCount}/${enrichedJobs.length} jobs got descriptions`);
    
    await closeBrowser(browser);
    return successCount > 0;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
};

testWelcomeToTheJungleFlow()
  .then(success => {
    console.log(`\n🏁 Test completed: ${success ? 'SUCCESS' : 'FAILED'}`);
  })
  .catch(error => {
    console.error('❌ Test error:', error);
  });