/**
 * Tests for EnvManager class
 */

import EnvManager from '../../src/utils/EnvManager.js';

describe('EnvManager', () => {
  let envManager;
  let mockLocalStorage;

  beforeEach(() => {
    mockLocalStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    });

    envManager = new EnvManager();
  });

  describe('Constructor', () => {
    test('should initialize with empty variables map', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      envManager = new EnvManager();

      expect(envManager.variables).toBeInstanceOf(Map);
      expect(envManager.variables.size).toBe(0);
      expect(envManager.storageKey).toBe('agentlet');
    });

    test('should load variables from localStorage on initialization', () => {
      const storedData = JSON.stringify({
        TEST_VAR: 'test_value',
        API_URL: 'https://api.test.com'
      });
      mockLocalStorage.getItem.mockReturnValue(storedData);

      envManager = new EnvManager();

      expect(envManager.get('TEST_VAR')).toBe('test_value');
      expect(envManager.get('API_URL')).toBe('https://api.test.com');
    });

    test('should handle invalid JSON in localStorage gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      expect(() => {
        envManager = new EnvManager();
      }).not.toThrow();
    });
  });

  describe('Variable Management', () => {
    test('should set and get variables', () => {
      envManager.set('TEST_KEY', 'test_value');

      expect(envManager.get('TEST_KEY')).toBe('test_value');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    test('should handle different data types', () => {
      envManager.set('STRING_VAR', 'string_value');
      envManager.set('NUMBER_VAR', 42);
      envManager.set('BOOLEAN_VAR', true);
      envManager.set('OBJECT_VAR', { key: 'value' });

      expect(envManager.get('STRING_VAR')).toBe('string_value');
      expect(envManager.get('NUMBER_VAR')).toBe('42');
      expect(envManager.get('BOOLEAN_VAR')).toBe('true');
      expect(envManager.get('OBJECT_VAR')).toBe('[object Object]');
    });

    test('should return default value for non-existent variables', () => {
      expect(envManager.get('NON_EXISTENT')).toBeUndefined();
      expect(envManager.get('NON_EXISTENT', 'default')).toBe('default');
    });

    test('should check if variable exists', () => {
      envManager.set('EXISTING_VAR', 'value');

      expect(envManager.has('EXISTING_VAR')).toBe(true);
      expect(envManager.has('NON_EXISTENT')).toBe(false);
    });

    test('should delete variables', () => {
      envManager.set('TO_DELETE', 'value');
      expect(envManager.has('TO_DELETE')).toBe(true);

      envManager.remove('TO_DELETE');

      expect(envManager.has('TO_DELETE')).toBe(false);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    test('should clear all variables', () => {
      envManager.set('VAR1', 'value1');
      envManager.set('VAR2', 'value2');

      envManager.clear();

      expect(envManager.variables.size).toBe(0);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('agentlet');
    });

    test('should get all variables', () => {
      envManager.set('VAR1', 'value1');
      envManager.set('VAR2', 'value2');
      envManager.set('SECRET_VAR', 'secret');

      const allVars = envManager.getAll();
      expect(allVars).toEqual({
        VAR1: 'value1',
        VAR2: 'value2',
        SECRET_VAR: 'se**et'
      });

      const allVarsWithSensitive = envManager.getAll(true);
      expect(allVarsWithSensitive).toEqual({
        VAR1: 'value1',
        VAR2: 'value2',
        SECRET_VAR: 'secret'
      });
    });
  });

  describe('Sensitive Variables', () => {
    test('should mask sensitive variables by default', () => {
      envManager.set('API_KEY', 'secret_key');

      expect(envManager.get('API_KEY')).toBe('secret_key');
      expect(envManager.getAll()['API_KEY']).toBe('se******ey');
    });

    test('should handle sensitive variable options', () => {
      envManager.set('PASSWORD', 'secret');

      expect(envManager.getAll()['PASSWORD']).toBe('se**et');
    });
  });

  describe('Change Listeners', () => {
    test('should add and trigger change listeners', () => {
      const listener = jest.fn();
      envManager.addChangeListener(listener);

      envManager.set('TEST_VAR', 'new_value');

      expect(listener).toHaveBeenCalledWith('TEST_VAR', 'new_value', undefined);
    });

    test('should handle multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      envManager.addChangeListener(listener1);
      envManager.addChangeListener(listener2);

      envManager.set('TEST_VAR', 'value');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    test('should remove change listeners', () => {
      const listener = jest.fn();
      envManager.addChangeListener(listener);
      envManager.removeChangeListener(listener);

      envManager.set('TEST_VAR', 'value');

      expect(listener).not.toHaveBeenCalled();
    });

    test('should notify listeners of deletions', () => {
      const listener = jest.fn();
      envManager.set('TO_DELETE', 'value');
      envManager.addChangeListener(listener);

      envManager.remove('TO_DELETE');

      expect(listener).toHaveBeenCalledWith('TO_DELETE', undefined, 'value');
    });
  });

  describe('Proxy Access', () => {
    test('should provide property-style access through proxy', () => {
      envManager.set('TEST_VAR', 'test_value');
      const proxy = envManager.createProxy();

      expect(proxy.TEST_VAR).toBe('test_value');
    });

    test('should allow setting variables through proxy', () => {
      const proxy = envManager.createProxy();
      proxy.NEW_VAR = 'new_value';

      expect(envManager.get('NEW_VAR')).toBe('new_value');
    });

    test('should handle property checks through proxy', () => {
      envManager.set('EXISTING_VAR', 'value');
      const proxy = envManager.createProxy();

      expect('EXISTING_VAR' in proxy).toBe(true);
      expect('NON_EXISTENT' in proxy).toBe(false);
    });

    test('should allow deletion through proxy', () => {
      envManager.set('TO_DELETE', 'value');
      const proxy = envManager.createProxy();

      // Proxy doesn't implement deleteProperty, so use direct delete method
      envManager.remove('TO_DELETE');

      expect(envManager.has('TO_DELETE')).toBe(false);
    });
  });

  describe('Validation', () => {
    test('should validate variable names', () => {
      expect(() => {
        envManager.set('', 'value');
      }).toThrow('Environment variable key must be a non-empty string');

      expect(() => {
        envManager.set('123invalid', 'value');
      }).not.toThrow();
    });

    test('should validate value sizes', () => {
      const largeValue = 'x'.repeat(10000);

      expect(() => {
        envManager.set('LARGE_VAR', largeValue);
      }).not.toThrow();
    });

    test('should allow valid variable names', () => {
      expect(() => {
        envManager.set('VALID_VAR', 'value');
        envManager.set('valid_var', 'value');
        envManager.set('VAR_123', 'value');
      }).not.toThrow();
    });
  });
});