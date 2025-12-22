import { searchTaskManager } from '../services/search-task-manager.js';
import logger from '../utils/logger.js';
import { supabase, type CreateJobSearchInput } from '../lib/supabase.js';
import express, { type Router } from 'express';

const router: Router = express.Router();

/**
 * POST /jobs/start
 * Start an async search task for job offers
 * Creates a job_searches record in Supabase and returns taskId + searchId
 * Body params: userId, jobTitle, location, skills, salary
 */
router.post('/start', async (req, res) => {
  try {
    const { userId, jobTitle, location, skills, salary } = req.body;

    if (!userId || !jobTitle || !location) {
      return res.status(400).json({
        error: 'Missing required parameters: userId, jobTitle, location',
      });
    }

    // Create job_searches record in Supabase
    const searchInput: CreateJobSearchInput = {
      user_id: userId,
      job_title: jobTitle,
      location,
      skills: skills || '',
      salary: parseInt(salary) || 0,
    };

    const { data: search, error: dbError } = await supabase
      .from('job_searches')
      .insert(searchInput)
      .select()
      .single();

    if (dbError || !search) {
      logger.error('Failed to create search record in Supabase:', dbError);
      return res.status(500).json({
        error: 'Failed to create search record',
      });
    }

    logger.info(
      `Created Supabase search record ${search.id} for user ${userId}`
    );

    const userCriteria = {
      jobTitle,
      location,
      skills: skills || '',
      salary: salary || '',
    };

    const taskId = searchTaskManager.createTask(
      userCriteria,
      userId,
      search.id
    );

    logger.info(
      `Created search task ${taskId} for "${jobTitle}" in "${location}" (search ID: ${search.id})`
    );

    return res.json({
      success: true,
      taskId,
      searchId: search.id,
      message: 'Search task created successfully',
      statusUrl: `/jobs/status/${taskId}`,
      resultsUrl: `/jobs/results/${taskId}`,
    });
  } catch (error) {
    logger.error('Error creating search task:', error);
    return res.status(500).json({ error: 'Failed to create search task' });
  }
});

/**
 * GET /jobs/status/:taskId
 * Get the status and progress of a search task
 */
router.get('/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = searchTaskManager.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Search task not found' });
    }

    return res.json({
      ...task,
      taskId: task.id,
      id: undefined,
    });
  } catch (error) {
    logger.error('Error getting task status:', error);
    return res.status(500).json({ error: 'Failed to get task status' });
  }
});

/**
 * GET /jobs/results/:taskId
 * Get the results of a completed search task
 */
router.get('/results/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = searchTaskManager.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Search task not found' });
    }

    if (task.status === 'pending' || task.status === 'processing') {
      return res.status(400).json({
        error: 'Search task not completed yet',
        status: task.status,
        progress: task.progress,
        message: task.message,
      });
    }

    if (task.status === 'failed') {
      return res.status(500).json({
        error: 'Search task failed',
        message: task.error || 'Unknown error',
      });
    }

    // Task is completed - return job offers
    return res.json({
      success: true,
      total_jobs: task.jobOffers?.length || 0,
      jobs: task.jobOffers || [],
    });
  } catch (error) {
    logger.error('Error getting task results:', error);
    return res.status(500).json({ error: 'Failed to get task results' });
  }
});

/**
 * GET /jobs/stats
 * Get queue statistics (for monitoring/debugging)
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = searchTaskManager.getStats();
    return res.json(stats);
  } catch (error) {
    logger.error('Error getting stats:', error);
    return res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
