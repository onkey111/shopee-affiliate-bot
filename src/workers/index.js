/**
 * Workers Module Index
 * 
 * Re-exports all worker components for easy importing.
 */

const {
    createWorker,
    startWorker,
    stopWorker,
    isWorkerRunning,
    getWorker,
    processJob
} = require('./affiliate-worker');

module.exports = {
    // Affiliate worker exports
    createWorker,
    startWorker,
    stopWorker,
    isWorkerRunning,
    getWorker,
    processJob
};

