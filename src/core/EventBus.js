/**
 * Event Bus
 * Handles internal event communication between components
 */

export class EventBus {
    constructor(debugMode = false) {
        this.listeners = new Map();
        this.debugMode = debugMode;
    }

    /**
     * Emit an event
     */
    emit(event, data) {
        const eventListeners = this.listeners.get(event) || [];
        eventListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
        
        if (this.debugMode) {
            console.log(`Event emitted: ${event}`, data);
        }
    }

    /**
     * Subscribe to an event
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Unsubscribe from an event
     */
    off(event, callback) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }

    /**
     * Request-response pattern for events
     */
    async request(event, data) {
        return new Promise((resolve, reject) => {
            const eventListeners = this.listeners.get(event) || [];
            if (eventListeners.length === 0) {
                reject(new Error(`No listeners for event: ${event}`));
                return;
            }
            
            try {
                const result = eventListeners[0](data);
                if (result instanceof Promise) {
                    result.then(resolve).catch(reject);
                } else {
                    resolve(result);
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get all registered events
     */
    getEvents() {
        return Array.from(this.listeners.keys());
    }

    /**
     * Get listener count for an event
     */
    getListenerCount(event) {
        const eventListeners = this.listeners.get(event);
        return eventListeners ? eventListeners.length : 0;
    }

    /**
     * Clear all listeners
     */
    clear() {
        this.listeners.clear();
    }

    /**
     * Clear listeners for a specific event
     */
    clearEvent(event) {
        this.listeners.delete(event);
    }
}