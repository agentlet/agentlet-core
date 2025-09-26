import js from '@eslint/js';

export default [
    // Apply to all JavaScript files
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                // Browser environment
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                location: 'readonly',
                history: 'readonly',
                navigator: 'readonly',
                screen: 'readonly',
                performance: 'readonly',
                fetch: 'readonly',
                AbortController: 'readonly',
                MutationObserver: 'readonly',
                URL: 'readonly',
                Image: 'readonly',
                Event: 'readonly',
                CustomEvent: 'readonly',
                ClipboardItem: 'readonly',
                HTMLElement: 'readonly',
                Node: 'readonly',
                NodeFilter: 'readonly',
                CSS: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                requestAnimationFrame: 'readonly',
                
                // Node.js environment
                process: 'readonly',
                Buffer: 'readonly',
                global: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                
                
                // Chrome extension APIs
                'chrome': 'readonly',
                
                // Agentlet Core globals
                'agentlet': 'writable',
                'agentletConfig': 'writable',
                
                // HTML2Canvas
                'html2canvas': 'readonly'
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            
            // Error prevention
            'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
            'no-console': 'off', // Allow console for debugging
            'no-debugger': 'warn',
            
            // Code style
            'indent': ['error', 4],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            
            // Best practices
            'eqeqeq': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            
            // ES6+
            'prefer-const': 'warn',
            'prefer-arrow-callback': 'warn',
            'prefer-template': 'warn',
            
            // Async/Promise
            'no-async-promise-executor': 'error',
            'require-await': 'warn'
        }
    },
    
    // Extension files configuration
    {
        files: ['extension/**/*.js'],
        languageOptions: {
            globals: {
                'chrome': 'readonly'
            }
        }
    },
    
    // Build tools configuration
    {
        files: ['tools/**/*.js'],
        languageOptions: {
            globals: {
                // Node.js only environment
                window: 'off',
                document: 'off',
                process: 'readonly',
                Buffer: 'readonly',
                global: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly'
            }
        }
    }
];