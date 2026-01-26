import serverless from 'serverless-http';
import { app } from '../server/index.js';

// Wrap the Express app as a serverless function
export const handler = serverless(app);
