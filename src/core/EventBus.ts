/**
 * Event Bus
 * Handles internal event communication between components
 */

import type { EventBusAPI } from '../types/public-api';

/** A single event-listener callback, matching {@link EventBusAPI}. */
type EventBusListener = (data: unknown) => unknown;

export class EventBus implements EventBusAPI {
    listeners: Map<string, EventBusListener[]>;
    debugMode: boolean;

    constructor(debugMode = false) {
        this.listeners = new Map();
        this.debugMode = debugMode;
    }

    /**
     * Emit an event
     */
    emit(event: string, data?: unknown): void {
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
    on(event: string, callback: EventBusListener): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    /**
     * Unsubscribe from an event
     */
    off(event: string, callback: EventBusListener): void {
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
    async request<T = unknown>(event: string, data?: unknown): Promise<T> {
        return new Promise((resolve, reject) => {
            const eventListeners = this.listeners.get(event) || [];
            if (eventListeners.length === 0) {
                reject(new Error(`No listeners for event: ${event}`));
                return;
            }

            try {
                const result = eventListeners[0](data);
                if (result instanceof Promise) {
                    // The listener's resolved value is genuinely dynamic (it is up to
                    // the caller-supplied generic T), so it is cast here rather than
                    // threaded through as `unknown`.
                    result.then(value => resolve(value as T)).catch(reject);
                } else {
                    resolve(result as T);
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get all registered events
     */
    getEvents(): string[] {
        return Array.from(this.listeners.keys());
    }

    /**
     * Get listener count for an event
     */
    getListenerCount(event: string): number {
        const eventListeners = this.listeners.get(event);
        return eventListeners ? eventListeners.length : 0;
    }

    /**
     * Clear all listeners
     */
    clear(): void {
        this.listeners.clear();
    }

    /**
     * Clear listeners for a specific event
     */
    clearEvent(event: string): void {
        this.listeners.delete(event);
    }
}
