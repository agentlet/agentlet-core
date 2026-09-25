module.exports = function (plop) {
  // Add handlebars helpers
  plop.setHelper('eq', function (a, b) {
    return a === b;
  });

  const hasDefaultsFlag = process.argv.includes('--defaults');
  const hasMinimalFlag = process.argv.includes('--minimal');

  // Get the current agentlet-core folder name dynamically
  const path = require('path');
  const currentFolderName = path.basename(process.cwd());

  // Read agentlet-core's own version dynamically so the scaffolded
  // project's default dependency always tracks whatever is published from
  // this checkout, rather than a hardcoded string that would drift the
  // moment this repo's package.json is bumped (see plopfile.js's `core`
  // handling below and plop-templates/agentlet/package.json).
  const coreVersion = require('./package.json').version;

  // Parse command line arguments for parameters
  const getCliParam = (paramName) => {
    const arg = process.argv.find(arg => arg.startsWith(`--${paramName}=`));
    return arg ? arg.split('=')[1] : null;
  };

  const getCliLibs = () => {
    const libsArg = getCliParam('libs');
    if (libsArg) {
      return libsArg.split(',').map(lib => lib.trim());
    }
    return null;
  };

  const cliName = getCliParam('name');
  const cliFolder = getCliParam('folder');
  const cliLibs = getCliLibs();
  const cliLoading = getCliParam('loading');
  const cliRegistry = getCliParam('registry');
  const cliUi = getCliParam('ui');
  // --core=local points the scaffolded project's agentlet-core dependency
  // at this checkout via `file:../{{agentletCoreFolder}}` instead of the
  // published npm package, for developing agentlet-core itself alongside a
  // scaffolded agentlet. Any other value (or omitting the flag) keeps the
  // default of depending on the published package.
  const cliCore = getCliParam('core');

  // If any CLI parameters are provided, skip prompts
  const skipPrompts = hasDefaultsFlag || hasMinimalFlag || cliName || cliFolder || cliLibs || cliLoading || cliUi || cliCore;

  plop.setGenerator('agentlet', {
    description: 'Create a new agentlet',
    prompts: skipPrompts ? [] : [
      {
        type: 'list',
        name: 'template',
        message: 'Which template would you like to use?',
        choices: [
          {
            name: 'Full (comprehensive example with all API features)',
            value: 'full'
          },
          {
            name: 'Minimal (simple starter with basic structure)',
            value: 'minimal'
          }
        ],
        default: 'full'
      },
      {
        type: 'list',
        name: 'ui',
        message: 'Which UI approach?',
        choices: [
          {
            name: 'html (getContent(), no framework)',
            value: 'html'
          },
          {
            name: 'react (mount a React 18 root - see docs/module-mount-api.md)',
            value: 'react'
          }
        ],
        default: 'html',
        // Minimal template only ships the getContent()-based module.
        when: (answers) => answers.template !== 'minimal'
      },
      {
        type: 'input',
        name: 'name',
        message: 'What is the name of your agentlet?',
        default: 'my-agentlet',
      },
      {
        type: 'input',
        name: 'folder',
        message: 'In which folder should the agentlet be created?',
        default: '../',
      },
      {
        type: 'list',
        name: 'core',
        message: 'Which agentlet-core dependency should this project use?',
        choices: [
          {
            name: `Published npm package (^${coreVersion}, recommended)`,
            value: 'npm'
          },
          {
            name: 'Local checkout (file:../<folder>, for developing agentlet-core itself)',
            value: 'local'
          }
        ],
        default: 'npm'
      },
      {
        type: 'list',
        name: 'libraryLoading',
        message: 'How would you like to handle external libraries?',
        choices: [
          {
            name: 'Bundle libraries (traditional - larger bundle, all features work offline)',
            value: 'bundled'
          },
          {
            name: 'Dynamic loading (registry-based - smaller bundle, requires library hosting)',
            value: 'registry'
          }
        ],
        default: 'bundled'
      },
      {
        type: 'checkbox',
        name: 'externalLibs',
        // html2canvas, xlsx and hotkeys-js are already bundled inside
        // agentlet-core (see src/libraries/LibrarySetup.js) and become
        // available as window.html2canvas/window.XLSX/window.hotkeys as
        // soon as agentlet.init() resolves, so the scaffold no longer
        // imports them itself (that used to bundle a second copy of each -
        // see plop-templates/agentlet/src/index.js). pdfjs-dist is the one
        // exception: the *library* is bundled the same way, but its worker
        // file (pdf.worker.min.mjs) still needs to be copied into this
        // project's own dist/ folder to be served locally, which is what
        // this option controls.
        message: 'Include the PDF.js worker file (needed for window.agentlet.ai.sendPromptWithPDF)?',
        when: (answers) => answers.libraryLoading === 'bundled',
        choices: [
          { name: 'pdfjs-dist (PDF worker file, for PDF processing)', value: 'pdfjs-dist', checked: true },
        ],
      },
      {
        type: 'input',
        name: 'registryUrl',
        message: 'Registry URL (where agentlets-registry.json and libraries will be hosted):',
        when: (answers) => answers.libraryLoading === 'registry',
        default: './agentlets-registry.json',
        validate: (input) => {
          if (!input.trim()) {
            return 'Registry URL is required for dynamic loading';
          }
          return true;
        }
      }
    ],
    actions: (data) => {
      // Set data from CLI parameters or defaults
      if (skipPrompts) {
        data.name = cliName || 'my-agentlet';
        data.folder = cliFolder || '../';
        data.template = hasMinimalFlag ? 'minimal' : 'full';
        data.libraryLoading = cliLoading || 'bundled';
        data.registryUrl = cliRegistry || './agentlets-registry.json';
        data.externalLibs = cliLibs || (data.libraryLoading === 'bundled' ? ['pdfjs-dist'] : []);
        // --defaults and --minimal keep the html (getContent()) template;
        // --ui=react opts into the React template otherwise.
        data.ui = (hasDefaultsFlag || hasMinimalFlag) ? 'html' : (cliUi === 'react' ? 'react' : 'html');
        // Default to the published npm package unless --core=local was
        // passed explicitly; --defaults and --minimal also default to npm.
        data.core = cliCore === 'local' ? 'local' : 'npm';
      }

      // Make agentlet-core's own version available to templates regardless
      // of whether prompts or CLI flags were used.
      data.coreVersion = coreVersion;

      // The minimal template only ships the getContent()-based module, so
      // 'ui' never applies to it, whether it came from a prompt (which
      // skips itself for 'minimal' via its own `when`) or from CLI flags.
      if (data.template === 'minimal') {
        data.ui = 'html';
      } else if (!data.ui) {
        data.ui = 'html';
      }

      // Add current folder name for dynamic agentlet-core reference
      data.agentletCoreFolder = currentFolderName;

      // Define ignore patterns based on template type
      const ignorePatterns = ['**/module*.js', '**/module-react.jsx']; // Always exclude module files initially, selected explicitly below
      if (data.template === 'minimal') {
        // In minimal mode, exclude feature-specific test files
        ignorePatterns.push(
          '**/module-table-extraction.spec.js',
          '**/module-message-bubbles.spec.js',
          '**/module-dialogs.spec.js'
        );
      }

      const actions = [
        {
          type: 'addMany',
          destination: '{{folder}}/{{name}}',
          base: 'plop-templates/agentlet',
          templateFiles: 'plop-templates/agentlet/**',
          globOptions: { dot: true, ignore: ignorePatterns }
        },
      ];

      // Add the appropriate module file based on template/ui choice
      if (data.template === 'minimal') {
        actions.push({
          type: 'add',
          path: '{{folder}}/{{name}}/src/module.js',
          templateFile: 'plop-templates/agentlet/src/module-minimal.js'
        });
      } else if (data.ui === 'react') {
        actions.push({
          type: 'add',
          path: '{{folder}}/{{name}}/src/module.js',
          templateFile: 'plop-templates/agentlet/src/module-react.jsx'
        });
      } else {
        actions.push({
          type: 'add',
          path: '{{folder}}/{{name}}/src/module.js',
          templateFile: 'plop-templates/agentlet/src/module.js'
        });
      }

      // React needs its own dependencies and a JSX-capable babel rule.
      // @babel/core, @babel/preset-env and babel-loader already ship
      // unconditionally in package.json (the html template is plain JS
      // transpiled by preset-env), so only what react/JSX adds on top is
      // conditional here.
      if (data.ui === 'react') {
        actions.push({
          type: 'modify',
          path: '{{folder}}/{{name}}/package.json',
          transform: (fileContents) => {
            const reactDependencies = [
              '    "@babel/preset-react": "^7.23.0"',
              '    "react": "^18.3.1"',
              '    "react-dom": "^18.3.1"'
            ].join(',\n');
            return fileContents.replace(
              '"webpack-dev-server": "^5.0.4"',
              `"webpack-dev-server": "^5.0.4",\n${reactDependencies}`
            );
          },
        });

        actions.push({
          type: 'modify',
          path: '{{folder}}/{{name}}/webpack.config.js',
          transform: (fileContents) => fileContents.replace(
            "presets: ['@babel/preset-env'],",
            "presets: ['@babel/preset-env', ['@babel/preset-react', { runtime: 'automatic' }]],"
          ),
        });
      }

      // Add dependencies to package.json based on selection (only for bundled mode).
      // Only pdfjs-dist is added here: it is not imported by this project's
      // own code (agentlet-core already bundles and exposes window.pdfjsLib),
      // it is only a devDependency so its `build/pdf.worker.min.mjs` file can
      // be copied into dist/ below. Its version is pinned to match
      // agentlet-core's own pdfjs-dist dependency (see this repo's root
      // package.json): pdf.js enforces that the worker's version matches the
      // main-thread API version exactly, and the API comes from whatever
      // version agentlet-core itself bundled, not from this devDependency.
      if (data.libraryLoading === 'bundled' && data.externalLibs && data.externalLibs.length > 0) {
        actions.push({
          type: 'modify',
          path: '{{folder}}/{{name}}/package.json',
          transform: (fileContents) => {
            let allDependencies = [];

            // Add copy-webpack-plugin if PDF.js is selected
            if (data.externalLibs.includes('pdfjs-dist')) {
              allDependencies.push('    "copy-webpack-plugin": "^12.0.2"');
            }

            // Add selected library dependencies
            data.externalLibs.forEach(lib => {
              if (lib === 'pdfjs-dist') allDependencies.push('    "pdfjs-dist": "^5.4.54"');
            });

            if (allDependencies.length > 0) {
              const dependenciesString = allDependencies.join(',\n');
              return fileContents.replace(
                '"webpack-dev-server": "^5.0.4"',
                `"webpack-dev-server": "^5.0.4",\n${dependenciesString}`
              );
            }
            return fileContents;
          },
        });

      }


      // Conditionally modify webpack config for PDF.js worker copying (only for bundled mode)
      if (data.libraryLoading === 'bundled' && data.externalLibs && data.externalLibs.includes('pdfjs-dist')) {
          actions.push({
            type: 'modify',
            path: '{{folder}}/{{name}}/webpack.config.js',
            transform: (fileContents) => {
              // Check if CopyPlugin patterns already exist
              if (fileContents.includes('// Copy PDF worker alongside registry for proper URL resolution')) {
                return fileContents; // Already has PDF worker copying
              }
              
              // Add PDF worker copying to CopyPlugin patterns
              const pdfWorkerPattern = `        // Copy PDF worker alongside registry for proper URL resolution
        {
          from: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          to: 'pdf.worker.min.mjs',
        },`;
              
              if (fileContents.includes('new CopyPlugin({')) {
                // CopyPlugin exists, add to patterns
                return fileContents.replace(
                  'patterns: [',
                  `patterns: [\n${pdfWorkerPattern}`
                );
              } else {
                // Add CopyPlugin entirely
                const copyPluginCode = `const CopyPlugin = require('copy-webpack-plugin');\n`;
                const pluginsCode = `  plugins: [
    new CopyPlugin({
      patterns: [
${pdfWorkerPattern}
      ],
    }),
  ]`;
                
                let result = fileContents;
                if (!fileContents.includes('CopyPlugin')) {
                  result = result.replace(/const path = require\('path'\);/, `const path = require('path');\n${copyPluginCode}`);
                }
                return result.replace(
                  /plugins: \[\s*\/\/ Plugins will be added conditionally by plop based on selected libraries\s*\]/,
                  pluginsCode.trim()
                );
              }
            },
          });
        }

      return actions;
    },
  });
};