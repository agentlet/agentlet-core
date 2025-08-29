/**
 * Tests for StorageManager class
 */

import StorageManager from '../../src/utils/StorageManager.js';

describe('StorageManager', () => {
  let storageManager;

  beforeEach(() => {
    storageManager = new StorageManager();
  });

  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      expect(storageManager.listeners).toBeInstanceOf(Map);
      expect(storageManager.originalMethods).toBeInstanceOf(Map);
    });

    test('should override storage methods for change detection', () => {
      expect(typeof localStorage.setItem).toBe('function');
      expect(typeof localStorage.removeItem).toBe('function');
      expect(typeof sessionStorage.setItem).toBe('function');
      expect(typeof sessionStorage.removeItem).toBe('function');
    });
  });

  describe('Basic Storage Operations', () => {
    test('should set and get localStorage items', () => {
      storageManager.set('test_key', 'test_value', 'localStorage');
      expect(storageManager.get('test_key', undefined, 'localStorage')).toBe('test_value');
    });

    test('should set and get sessionStorage items', () => {
      storageManager.set('test_key', 'test_value', 'sessionStorage');
      expect(storageManager.get('test_key', undefined, 'sessionStorage')).toBe('test_value');
    });

    test('should handle string conversion', () => {
      storageManager.set('number_key', 42, 'localStorage');
      expect(storageManager.get('number_key', undefined, 'localStorage')).toBe('42');
    });

    test('should return default for non-existent items', () => {
      expect(storageManager.get('non_existent', 'default', 'localStorage')).toBe('default');
    });

    test('should check if items exist', () => {
      storageManager.set('existing_key', 'value', 'localStorage');

      expect(storageManager.has('existing_key', 'localStorage')).toBe(true);
      expect(storageManager.has('non_existent', 'localStorage')).toBe(false);
    });

    test('should remove items', () => {
      storageManager.set('to_remove', 'value', 'localStorage');
      expect(storageManager.has('to_remove', 'localStorage')).toBe(true);

      storageManager.remove('to_remove', 'localStorage');
      expect(storageManager.has('to_remove', 'localStorage')).toBe(false);
    });

    test('should clear all items from storage', () => {
      storageManager.set('key1', 'value1', 'localStorage');
      storageManager.set('key2', 'value2', 'localStorage');

      storageManager.clear('localStorage');

      expect(storageManager.has('key1', 'localStorage')).toBe(false);
      expect(storageManager.has('key2', 'localStorage')).toBe(false);
    });
  });

  describe('Change Detection', () => {
    test('should detect localStorage changes', () => {
      const listener = jest.fn();
      storageManager.addChangeListener(listener);

      localStorage.setItem('change_key', 'new_value');

      expect(listener).toHaveBeenCalledWith('localStorage', 'change_key', 'new_value', null);
    });

    test('should detect sessionStorage changes', () => {
      const listener = jest.fn();
      storageManager.addChangeListener(listener);

      sessionStorage.setItem('session_key', 'session_value');

      expect(listener).toHaveBeenCalledWith('sessionStorage', 'session_key', 'session_value', null);
    });

    test('should handle multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      storageManager.addChangeListener(listener1);
      storageManager.addChangeListener(listener2);

      localStorage.setItem('multi_listener_key', 'value');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    test('should remove change listeners', () => {
      const listener = jest.fn();
      storageManager.addChangeListener(listener);
      storageManager.removeChangeListener(listener);

      localStorage.setItem('removed_listener_key', 'value');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid storage type', () => {
      expect(() => {
        storageManager.set('key', 'value', 'invalidStorage');
      }).toThrow('Invalid storage type');
    });

    test('should validate storage keys', () => {
      expect(() => {
        storageManager.set('', 'value', 'localStorage');
      }).toThrow('Storage key must be a non-empty string');
    });

    test('should validate storage values', () => {
      expect(() => {
        storageManager.set('key', null, 'localStorage');
      }).toThrow('Storage value cannot be null or undefined');
    });
  });
});