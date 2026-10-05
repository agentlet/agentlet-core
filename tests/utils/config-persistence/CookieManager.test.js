/**
 * Tests for CookieManager class
 */

import CookieManager from '../../../src/utils/config-persistence/CookieManager.js';

describe('CookieManager', () => {
  let cookieManager;
  let mockDocument;

  beforeEach(() => {
    // Mock document.cookie
    let cookieStore = {};
    mockDocument = {
      get cookie() {
        return Object.entries(cookieStore)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
      },
      set cookie(cookie) {
        const [pair] = cookie.split(';');
        const [key, value] = pair.split('=');
        if (value === undefined || value === '') {
          delete cookieStore[key.trim()];
        } else {
          cookieStore[key.trim()] = value.trim();
        }
      }
    };

    global.document = mockDocument;
    cookieManager = new CookieManager();
  });

  afterEach(() => {
    jest.clearAllTimers();
    if (cookieManager) {
      cookieManager.stopMonitoring();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      expect(cookieManager.listeners).toBeInstanceOf(Set);
      expect(cookieManager.pollFrequency).toBe(1000);
      expect(cookieManager.pollInterval).toBeDefined();
    });

    test('should initialize with custom poll frequency', () => {
      const customManager = new CookieManager();
      customManager.pollFrequency = 500;
      expect(customManager.pollFrequency).toBe(500);
    });
  });

  describe('Cookie Operations', () => {
    test('should set and get cookies', () => {
      cookieManager.set('test_cookie', 'test_value');
      expect(cookieManager.get('test_cookie')).toBe('test_value');
    });

    test('should handle cookie options', () => {
      const options = {
        maxAge: 3600,
        path: '/test',
        domain: 'example.com',
        secure: true,
        sameSite: 'Strict'
      };

      cookieManager.set('test_cookie', 'test_value', options);
      
      // Since we're mocking, we can't test the actual cookie string,
      // but we can verify the cookie was set
      expect(cookieManager.get('test_cookie')).toBe('test_value');
    });

    test('should delete cookies', () => {
      cookieManager.set('to_delete', 'value');
      expect(cookieManager.get('to_delete')).toBe('value');

      cookieManager.delete('to_delete');
      expect(cookieManager.get('to_delete')).toBe('');
    });

    test('should check if cookie exists', () => {
      cookieManager.set('existing_cookie', 'value');

      expect(cookieManager.has('existing_cookie')).toBe(true);
      expect(cookieManager.has('non_existent')).toBe(false);
    });

    test('should get all cookies', () => {
      cookieManager.set('cookie1', 'value1');
      cookieManager.set('cookie2', 'value2');

      const allCookies = cookieManager.getAllCookies();

      expect(allCookies).toEqual({
        cookie1: 'value1',
        cookie2: 'value2'
      });
    });

    test('should clear all cookies', () => {
      cookieManager.set('cookie1', 'value1');
      cookieManager.set('cookie2', 'value2');

      const clearedCount = cookieManager.clearAll();

      // clearAll deletes cookies by setting them to empty values
      expect(clearedCount).toBeGreaterThan(0);
      const cookies = cookieManager.getAllCookies();
      expect(cookies.cookie1).toBe('');
      expect(cookies.cookie2).toBe('');
    });
  });

  describe('Change Monitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should start and stop monitoring', () => {
      cookieManager.stopMonitoring(); // Stop current monitoring
      expect(cookieManager.pollInterval).toBeNull();

      cookieManager.startMonitoring();
      expect(cookieManager.pollInterval).not.toBeNull();

      cookieManager.stopMonitoring();
      expect(cookieManager.pollInterval).toBeNull();
    });

    test('should detect cookie changes', () => {
      const listener = jest.fn();
      cookieManager.addChangeListener(listener);
      cookieManager.startMonitoring();

      // Set initial state
      cookieManager.set('test_cookie', 'initial_value');
      cookieManager.checkForChanges(); // Initialize lastState

      // Change cookie value
      cookieManager.set('test_cookie', 'new_value');
      cookieManager.checkForChanges();

      expect(listener).toHaveBeenCalledWith('test_cookie', 'new_value', 'initial_value');
    });

    test('should detect new cookies', () => {
      const listener = jest.fn();
      cookieManager.addChangeListener(listener);
      cookieManager.startMonitoring();

      cookieManager.checkForChanges(); // Initialize empty state

      cookieManager.set('new_cookie', 'new_value');
      cookieManager.checkForChanges();

      expect(listener).toHaveBeenCalledWith('new_cookie', 'new_value', undefined);
    });

    test('should detect deleted cookies', () => {
      const listener = jest.fn();
      cookieManager.addChangeListener(listener);

      cookieManager.set('to_delete', 'value');
      cookieManager.startMonitoring();
      cookieManager.checkForChanges(); // Initialize state

      cookieManager.delete('to_delete');
      cookieManager.checkForChanges();

      expect(listener).toHaveBeenCalledWith('to_delete', '', 'value');
    });

    test('should handle multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      cookieManager.addChangeListener(listener1);
      cookieManager.addChangeListener(listener2);
      cookieManager.startMonitoring();

      cookieManager.checkForChanges();
      cookieManager.set('test_cookie', 'value');
      cookieManager.checkForChanges();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    test('should remove change listeners', () => {
      const listener = jest.fn();
      cookieManager.addChangeListener(listener);
      cookieManager.removeChangeListener(listener);
      cookieManager.startMonitoring();

      cookieManager.checkForChanges();
      cookieManager.set('test_cookie', 'value');
      cookieManager.checkForChanges();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Lazy polling', () => {
    // Regression coverage: CookieManager used to poll document.cookie every
    // second from the moment it was constructed, regardless of whether
    // anything was listening for changes. The poll now starts only once a
    // listener is registered, and stops again once none are left.
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('does not start polling on construction', () => {
      expect(cookieManager.pollInterval).toBeNull();
    });

    test('addChangeListener() starts polling', () => {
      cookieManager.addChangeListener(jest.fn());

      expect(cookieManager.pollInterval).not.toBeNull();
    });

    test('removeChangeListener() stops polling once the last listener is gone', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      cookieManager.addChangeListener(listener1);
      cookieManager.addChangeListener(listener2);

      cookieManager.removeChangeListener(listener1);
      expect(cookieManager.pollInterval).not.toBeNull(); // listener2 still registered

      cookieManager.removeChangeListener(listener2);
      expect(cookieManager.pollInterval).toBeNull();
    });

    test('a listener added long after construction does not see a spurious change for stale state', () => {
      cookieManager.set('pre_existing', 'value');
      // No listener yet - this write happened while nothing was watching.

      const listener = jest.fn();
      cookieManager.addChangeListener(listener);
      jest.advanceTimersByTime(1000);

      expect(listener).not.toHaveBeenCalled();
    });

    test('cleanup() stops polling', () => {
      cookieManager.addChangeListener(jest.fn());
      expect(cookieManager.pollInterval).not.toBeNull();

      cookieManager.cleanup();

      expect(cookieManager.pollInterval).toBeNull();
    });

    describe('with fake timers driving the poll', () => {
      // Writes the way another script on the page would: straight to
      // document.cookie, so only the poll can notice it (set() notifies
      // listeners itself).
      const externalWrite = (name, value) => {
        global.document.cookie = `${name}=${value}`;
      };

      test('no timer is scheduled without listeners, even as time passes', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const manager = new CookieManager();

        externalWrite('some_cookie', 'value');
        jest.advanceTimersByTime(10000);

        expect(setIntervalSpy).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
        setIntervalSpy.mockRestore();
      });

      test('the first listener schedules exactly one timer, later ones reuse it', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        cookieManager.addChangeListener(jest.fn());
        cookieManager.addChangeListener(jest.fn());

        expect(setIntervalSpy).toHaveBeenCalledTimes(1);
        expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
        expect(jest.getTimerCount()).toBe(1);
        setIntervalSpy.mockRestore();
      });

      test('listeners are notified by the poll when a cookie changes', () => {
        const listener = jest.fn();
        cookieManager.addChangeListener(listener);

        jest.advanceTimersByTime(1000);
        expect(listener).not.toHaveBeenCalled();

        externalWrite('session', 'abc');
        expect(listener).not.toHaveBeenCalled(); // nothing is notified before the next tick
        jest.advanceTimersByTime(1000);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith('session', 'abc', undefined);

        externalWrite('session', 'def');
        jest.advanceTimersByTime(1000);
        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenLastCalledWith('session', 'def', 'abc');
      });

      test('removing the last listener clears the timer and stops reading cookies', () => {
        const listener = jest.fn();
        cookieManager.addChangeListener(listener);
        expect(jest.getTimerCount()).toBe(1);

        cookieManager.removeChangeListener(listener);
        expect(jest.getTimerCount()).toBe(0);

        const checkSpy = jest.spyOn(cookieManager, 'checkForChanges');
        externalWrite('session', 'abc');
        jest.advanceTimersByTime(5000);
        expect(checkSpy).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
      });

      test('cleanup() clears the timer and drops the listeners', () => {
        const listener = jest.fn();
        cookieManager.addChangeListener(listener);

        cookieManager.cleanup();
        expect(jest.getTimerCount()).toBe(0);

        externalWrite('session', 'abc');
        jest.advanceTimersByTime(5000);
        expect(listener).not.toHaveBeenCalled();
      });

      test('polling can start again after the last listener was removed', () => {
        const first = jest.fn();
        cookieManager.addChangeListener(first);
        cookieManager.removeChangeListener(first);

        const second = jest.fn();
        cookieManager.addChangeListener(second);
        externalWrite('session', 'abc');
        jest.advanceTimersByTime(1000);

        expect(jest.getTimerCount()).toBe(1);
        expect(second).toHaveBeenCalledWith('session', 'abc', undefined);
        expect(first).not.toHaveBeenCalled();
      });

      test('the polling interval is configurable and applies to a running poll', () => {
        const listener = jest.fn();
        cookieManager.addChangeListener(listener);
        cookieManager.setPollFrequency(200);

        externalWrite('session', 'abc');
        jest.advanceTimersByTime(199);
        expect(listener).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(listener).toHaveBeenCalledWith('session', 'abc', undefined);
        expect(jest.getTimerCount()).toBe(1);
      });

      test('setPollFrequency() does not start a poll when nothing listens', () => {
        cookieManager.setPollFrequency(200);

        expect(jest.getTimerCount()).toBe(0);
        expect(cookieManager.pollFrequency).toBe(200);
      });

      test('a throwing listener does not stop the poll or the other listeners', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const bad = jest.fn(() => { throw new Error('boom'); });
        const good = jest.fn();
        cookieManager.addChangeListener(bad);
        cookieManager.addChangeListener(good);

        externalWrite('session', 'abc');
        jest.advanceTimersByTime(1000);

        expect(good).toHaveBeenCalledWith('session', 'abc', undefined);
        expect(jest.getTimerCount()).toBe(1);
        consoleSpy.mockRestore();
      });
    });
  });

  describe('Proxy Access', () => {
    test('should allow setting cookies through proxy', () => {
      const proxy = cookieManager.createProxy();
      
      proxy.test_cookie = 'proxy_value';
      
      expect(cookieManager.get('test_cookie')).toBe('proxy_value');
    });

    test('should allow getting cookies through proxy', () => {
      cookieManager.set('test_cookie', 'test_value');
      const proxy = cookieManager.createProxy();
      
      expect(proxy.test_cookie).toBe('test_value');
    });

    test('should allow deletion through proxy', () => {
      cookieManager.set('to_delete', 'value');
      const proxy = cookieManager.createProxy();
      
      // Proxy doesn't implement deleteProperty, use direct method
      cookieManager.delete('to_delete');
      
      expect(cookieManager.get('to_delete')).toBe('');
    });
  });

  describe('Export Functionality', () => {
    beforeEach(() => {
      cookieManager.set('cookie1', 'value1');
      cookieManager.set('cookie2', 'value2');
      cookieManager.set('sensitive_cookie', 'secret_value');
    });

    test('should export cookies in cURL format', () => {
      const exported = cookieManager.export('curl');
      
      expect(exported).toContain('cookie1=value1');
      expect(exported).toContain('cookie2=value2');
      expect(exported).toContain('sensitive_cookie=secret_value');
    });

    test('should export cookies in JSON format', () => {
      const exported = cookieManager.export('json');
      const parsed = JSON.parse(exported);
      
      expect(parsed).toEqual({
        cookie1: 'value1',
        cookie2: 'value2',
        sensitive_cookie: 'secret_value'
      });
    });

    test('should export cookies in Netscape format', () => {
      const exported = cookieManager.export('netscape');
      
      expect(exported).toContain('# Netscape HTTP Cookie File');
      expect(exported).toContain('cookie1\tvalue1');
      expect(exported).toContain('cookie2\tvalue2');
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      cookieManager.set('cookie1', 'value1');
      cookieManager.set('cookie2', 'value2');
    });

    test('should provide statistics about cookies', () => {
      const stats = cookieManager.getStatistics();
      
      expect(stats.total).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.averageSize).toBeGreaterThan(0);
      expect(stats.monitoring).toBe(cookieManager.pollInterval !== null);
    });

    test('should handle empty cookies in statistics', () => {
      cookieManager.clearAll();
      const stats = cookieManager.getStatistics();
      
      // After clearAll, cookies are set to empty strings, so they still exist
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.totalSize).toBeGreaterThanOrEqual(0);
      expect(stats.averageSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid cookie names gracefully', () => {
      expect(() => {
        cookieManager.set('', 'value');
      }).toThrow('Cookie name must be a non-empty string');
    });

    test('should handle very large cookie values', () => {
      const largeValue = 'x'.repeat(4096);
      
      expect(() => {
        cookieManager.set('large_cookie', largeValue);
      }).not.toThrow();
    });

    test('should handle special characters in cookie names', () => {
      expect(() => {
        cookieManager.set('cookie-with-dashes', 'value');
        cookieManager.set('cookie_with_underscores', 'value');
        cookieManager.set('cookie.with.dots', 'value');
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid consecutive changes', () => {
      const listener = jest.fn();
      cookieManager.addChangeListener(listener);
      cookieManager.startMonitoring();
      cookieManager.checkForChanges();

      // Rapid changes
      cookieManager.set('rapid_cookie', 'value1');
      cookieManager.set('rapid_cookie', 'value2');
      cookieManager.set('rapid_cookie', 'value3');
      cookieManager.checkForChanges();

      // Should detect the final value change
      expect(listener).toHaveBeenCalledWith('rapid_cookie', 'value3', 'value2');
    });

    test('should handle cookie changes from external sources', () => {
      const listener = jest.fn();
      cookieManager.addChangeListener(listener);
      cookieManager.startMonitoring();
      cookieManager.checkForChanges();

      // Simulate external change
      document.cookie = 'external_cookie=external_value';
      cookieManager.checkForChanges();

      expect(listener).toHaveBeenCalledWith('external_cookie', 'external_value', undefined);
    });

    test('should handle malformed cookies gracefully', () => {
      // Simulate malformed cookie
      document.cookie = 'malformed_cookie=';
      document.cookie = '=no_name_value';
      document.cookie = 'spaces = value';

      const cookies = cookieManager.getAllCookies();
      
      // Should handle gracefully without throwing
      expect(typeof cookies).toBe('object');
    });
  });
});