import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createPool } from './db.js';

const pool = createPool();
const port = Number(process.env.PORT) || 3001;

serve({ fetch: createApp({ pool }).fetch, port }, (info) => {
  console.log(`gallery api on http://localhost:${info.port}`);
});
