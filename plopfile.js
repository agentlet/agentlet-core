module.exports = function (plop) {
  const hasDefaultsFlag = process.argv.includes('--defaults');
  
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
  
  // If any CLI parameters are provided, skip prompts
  const skipPrompts = hasDefaultsFlag || cliName || cliFolder || cliLibs;

  plop.setGenerator('agentlet', {
    description: 'Create a new agentlet',
    prompts: skipPrompts ? [] : [
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
        type: 'checkbox',
        name: 'externalLibs',
        message: 'Which external libraries do you want to bundle with your agentlet?',
        choices: [
          { name: 'jQuery', value: 'jquery', checked: true },
          { name: 'html2canvas', value: 'html2canvas', checked: true },
          { name: 'xlsx (SheetJS)', value: 'xlsx', checked: true },
          { name: 'pdfjs-dist (PDF.js)', value: 'pdfjs-dist', checked: true },
        ],
      }
    ],
    actions: (data) => {
      // Set data from CLI parameters or defaults
      if (skipPrompts) {
        data.name = cliName || 'my-agentlet';
        data.folder = cliFolder || '../';
        data.externalLibs = cliLibs || ['jquery', 'html2canvas', 'xlsx', 'pdfjs-dist'];
      }
      const actions = [
        {
          type: 'addMany',
          destination: '{{folder}}/{{name}}',
          base: 'plop-templates/agentlet',
          templateFiles: 'plop-templates/agentlet/**',
          globOptions: { dot: true }
        },
      ];

      // Add dependencies to package.json based on selection
      if (data.externalLibs && data.externalLibs.length > 0) {
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
              if (lib === 'jquery') allDependencies.push('    "jquery": "^3.7.1"');
              if (lib === 'html2canvas') allDependencies.push('    "html2canvas": "^1.4.1"');
              if (lib === 'xlsx') allDependencies.push('    "xlsx": "^0.18.5"');
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

        // Add imports to src/index.js based on selection
        actions.push({
          type: 'modify',
          path: '{{folder}}/{{name}}/src/index.js',
          transform: (fileContents) => {
            // Check if imports already exist in the template (avoid duplication)
            if (fileContents.includes('import jQuery from \'jquery\'')) {
              // Template already has imports, no need to add them
              return fileContents;
            }
            
            let imports = '';
            if (data.externalLibs.includes('jquery')) {
              imports += 'import jQuery from \'jquery\';\n';
              imports += 'window.jQuery = jQuery;\n'; // Expose jQuery globally
              imports += 'window.agentlet?.refreshjQuery?.(); // Update agentlet jQuery reference\n';
            }
            if (data.externalLibs.includes('html2canvas')) {
              imports += 'import html2canvas from \'html2canvas\';\n';
              imports += 'window.html2canvas = html2canvas;\n'; // Expose html2canvas globally
            }
            if (data.externalLibs.includes('xlsx')) {
              imports += 'import * as XLSX from \'xlsx\';\n';
              imports += 'window.XLSX = XLSX;\n'; // Expose XLSX globally
            }
            if (data.externalLibs.includes('pdfjs-dist')) {
              imports += 'import * as pdfjsLib from \'pdfjs-dist\';\n';
              imports += 'window.pdfjsLib = pdfjsLib;\n'; // Expose PDF.js globally
            }
            return imports + fileContents;
          },
        });

        // Conditionally modify webpack config for PDF.js worker copying
        if (data.externalLibs.includes('pdfjs-dist')) {
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
          to: 'pdf.worker.min.js',
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
      }

      return actions;
    },
  });
};