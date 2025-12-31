/**
 * Circuit Breaker Utility
 * 
 * Implements the circuit breaker pattern to prevent cascading failures.
 * States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
 */

const EventEmitter = require('events');
const logger = require('./logger');

// Circuit breaker states
const STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker extends EventEmitter {
    /**
     * Create a circuit breaker
     * @param {Object} options - Configuration options
     * @param {string} options.name - Name for logging
     * @param {number} [options.failureThreshold=5] - Failures before opening
     * @param {number} [options.resetTimeout=30000] - Time in ms before trying half-open
     * @param {number} [options.halfOpenRequests=3] - Successful requests to close
     */
    constructor(options = {}) {
        super();
        this.name = options.name || 'default';
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 30000;
        this.halfOpenRequests = options.halfOpenRequests || 3;

        this.state = STATES.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.resetTimer = null;

        // Stats
        this.stats = {
            totalCalls: 0,
            totalSuccess: 0,
            totalFailure: 0,
            totalRejected: 0,
            lastStateChange: Date.now()
        };

        logger.info('Circuit breaker created', { name: this.name, failureThreshold: this.failureThreshold });
    }

    /**
     * Execute a function with circuit breaker protection
     * @param {Function} asyncFn - Async function to execute
     * @returns {Promise<any>} Result of the function
     * @throws {Error} If circuit is open or function fails
     */
    async execute(asyncFn) {
        this.stats.totalCalls++;

        // Check if circuit is open
        if (this.state === STATES.OPEN) {
            // Check if reset timeout has passed
            if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
                this._transitionTo(STATES.HALF_OPEN);
            } else {
                this.stats.totalRejected++;
                this.emit('rejected', { name: this.name, state: this.state });
                const error = new Error(`Circuit breaker ${this.name} is OPEN`);
                error.code = 'CIRCUIT_OPEN';
                throw error;
            }
        }

        try {
            const result = await asyncFn();
            this._onSuccess();
            return result;
        } catch (err) {
            this._onFailure(err);
            throw err;
        }
    }

    /**
     * Handle successful execution
     * @private
     */
    _onSuccess() {
        this.stats.totalSuccess++;
        this.emit('success', { name: this.name, state: this.state });

        if (this.state === STATES.HALF_OPEN) {
            this.successes++;
            if (this.successes >= this.halfOpenRequests) {
                this._transitionTo(STATES.CLOSED);
            }
        } else if (this.state === STATES.CLOSED) {
            // Reset failure count on success
            this.failures = 0;
        }
    }

    /**
     * Handle failed execution
     * @param {Error} err - The error that occurred
     * @private
     */
    _onFailure(err) {
        this.stats.totalFailure++;
        this.failures++;
        this.lastFailureTime = Date.now();
        this.emit('failure', { name: this.name, state: this.state, error: err.message });

        if (this.state === STATES.HALF_OPEN) {
            // Any failure in half-open goes back to open
            this._transitionTo(STATES.OPEN);
        } else if (this.state === STATES.CLOSED && this.failures >= this.failureThreshold) {
            this._transitionTo(STATES.OPEN);
        }
    }

    /**
     * Transition to a new state
     * @param {string} newState - New state
     * @private
     */
    _transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        this.stats.lastStateChange = Date.now();

        logger.info('Circuit breaker state change', {
            name: this.name,
            from: oldState,
            to: newState
        });

        if (newState === STATES.CLOSED) {
            this.failures = 0;
            this.successes = 0;
        } else if (newState === STATES.HALF_OPEN) {
            this.successes = 0;
        }

        this.emit('stateChange', { name: this.name, from: oldState, to: newState });
    }

    /**
     * Get current state
     * @returns {string} Current state
     */
    getState() {
        return this.state;
    }

    /**
     * Get circuit breaker statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            name: this.name,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            ...this.stats
        };
    }

    /**
     * Manually reset the circuit breaker to closed state
     */
    reset() {
        this._transitionTo(STATES.CLOSED);
        logger.info('Circuit breaker manually reset', { name: this.name });
    }

    /**
     * Manually trip the circuit breaker to open state
     */
    trip() {
        this.lastFailureTime = Date.now();
        this._transitionTo(STATES.OPEN);
        logger.warn('Circuit breaker manually tripped', { name: this.name });
    }
}

module.exports = {
    CircuitBreaker,
    STATES
};

