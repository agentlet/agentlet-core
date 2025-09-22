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

  // If any CLI parameters are provided, skip prompts
  const skipPrompts = hasDefaultsFlag || hasMinimalFlag || cliName || cliFolder || cliLibs || cliLoading;

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
        message: 'Which external libraries do you want to include?',
        when: (answers) => answers.libraryLoading === 'bundled',
        choices: [
          { name: 'html2canvas (screenshots)', value: 'html2canvas', checked: true },
          { name: 'xlsx (Excel export)', value: 'xlsx', checked: true },
          { name: 'pdfjs-dist (PDF processing)', value: 'pdfjs-dist', checked: true },
          { name: 'hotkeys-js (keyboard shortcuts)', value: 'hotkeys-js', checked: true },
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
        data.externalLibs = cliLibs || (data.libraryLoading === 'bundled' ? ['html2canvas', 'xlsx', 'pdfjs-dist', 'hotkeys-js'] : []);
      }

      // Add current folder name for dynamic agentlet-core reference
      data.agentletCoreFolder = currentFolderName;

      // Define ignore patterns based on template type
      const ignorePatterns = ['**/module*.js']; // Always exclude module files initially
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

      // Add the appropriate module file based on template choice
      if (data.template === 'minimal') {
        actions.push({
          type: 'add',
          path: '{{folder}}/{{name}}/src/module.js',
          templateFile: 'plop-templates/agentlet/src/module-minimal.js'
        });
      } else {
        actions.push({
          type: 'add',
          path: '{{folder}}/{{name}}/src/module.js',
          templateFile: 'plop-templates/agentlet/src/module.js'
        });
      }

      // Add dependencies to package.json based on selection (only for bundled mode)
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
              if (lib === 'html2canvas') allDependencies.push('    "html2canvas": "^1.4.1"');
              if (lib === 'xlsx') allDependencies.push('    "xlsx": "^0.18.5"');
              if (lib === 'pdfjs-dist') allDependencies.push('    "pdfjs-dist": "^4.6.82"');
              if (lib === 'hotkeys-js') allDependencies.push('    "hotkeys-js": "^3.10.1"');
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