/**
 * Server startup initialization.
 * Import this module at the top of any API route to ensure it runs on startup.
 */

import { initQueueWorker } from "./queue";

// Initialize on first import (singleton)
initQueueWorker();
