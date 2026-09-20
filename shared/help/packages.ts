/**
 * THE HELP PANEL'S CATALOGUE: installing things, winget, npm, pip and venv (#12).
 *
 * winget, npm and pip are programs rather than shell features, so their
 * commands read the same in PowerShell, cmd and bash and the entries are shell
 * 'any'. Where a task genuinely differs by shell (activating a virtual
 * environment is the one that always does), the variants are labelled with the
 * shell they belong to. "Running scripts is disabled", the first thing a
 * newcomer meets after installing Node, is NOT here: its fix is a PowerShell
 * setting, so it is PowerShell's entry (ps-scripts-disabled), which carries
 * the npm.cmd way round it and the words npm and Activate print.
 *
 * Two things were kept OUT on purpose. `npm run SCRIPT -- ARGS`: PowerShell
 * resolves npm to npm.ps1 and swallows the `--`, so the line works in cmd and
 * bash and silently does something else in PowerShell. And `&&` anywhere:
 * Windows PowerShell 5.1 has no such operator.
 *
 * HOW THESE WERE CHECKED (2026-09-20, npm 11.17, Python 3.14, pip 26.1): the
 * read-only npm and pip commands were run in a throwaway folder (npm run, npm
 * outdated, npm ls, npm ls -g, npm view, npm cache verify, npm init -y, pip
 * list, pip list --outdated, pip show, pip freeze). A venv was created there
 * and activated four ways: PowerShell 7.6, Windows PowerShell 5.1, cmd.exe and
 * Git Bash. That `pip freeze > requirements.txt` from Windows PowerShell 5.1
 * (which writes UTF-16) still reads back was confirmed in pip's own parser,
 * which sniffs the byte-order mark. NOTHING THAT INSTALLS, REMOVES OR NEEDS
 * ELEVATION WAS RUN: npm install, uninstall, update, cache clean and pip
 * install are listed from their documentation and long use.
 * winget could not be run at all on the machine this was written on, so its
 * five entries are from its documentation. WSL was not available either; the
 * Ubuntu variants (python3, .venv/bin/activate) were reasoned, not run.
 */
import type { HelpEntry } from './types'

export const PACKAGES_HELP: readonly HelpEntry[] = [
  // ---- winget: programs for Windows itself ----
  {
    id: 'pkg-winget-search',
    shell: 'any',
    category: 'packages',
    task: 'Find a program to install (winget)',
    summary:
      'Searches the Windows package catalogue by name. winget is built into Windows 11, the equivalent of apt or brew. Note the Id column in the results: that is what you install by.',
    command: 'winget search NAME',
    variants: [{ label: 'See the details of one package before installing it', command: 'winget show --id PACKAGE_ID' }],
    placeholders: { NAME: 'Part of the program name, such as node or python', PACKAGE_ID: 'The Id from the search results, such as Git.Git' },
    keywords: [
      'winget',
      'search for a program',
      'find an app',
      'package manager for windows',
      'app store',
      'apt',
      'brew',
      'choco',
      'is there a package for',
      'install software'
    ]
  },
  {
    id: 'pkg-winget-install',
    shell: 'any',
    category: 'packages',
    task: 'Install a program (winget)',
    summary:
      'Downloads and installs a program by its exact Id. Windows may show its usual permission prompt. Open a NEW terminal tab afterwards, or the shell will not find the new command.',
    command: 'winget install --id PACKAGE_ID -e',
    variants: [
      { label: 'Git', command: 'winget install --id Git.Git -e' },
      { label: 'Node.js (the long-term support version), which brings npm', command: 'winget install --id OpenJS.NodeJS.LTS -e' },
      { label: 'PowerShell 7', command: 'winget install --id Microsoft.PowerShell -e' }
    ],
    placeholders: { PACKAGE_ID: 'The Id shown by winget search, such as Python.Python.3.13' },
    keywords: [
      'install',
      'install a program',
      'install git',
      'install node',
      'install python',
      'download an app',
      'apt install',
      'brew install',
      'setup',
      'get a tool'
    ]
  },
  {
    id: 'pkg-winget-upgrade',
    shell: 'any',
    category: 'packages',
    task: 'Update all installed programs (winget)',
    summary:
      'Upgrades every program winget knows a newer version of. Run plain winget upgrade first to see the list without changing anything.',
    command: 'winget upgrade --all',
    variants: [
      { label: 'Only list what has an update', command: 'winget upgrade' },
      { label: 'Update one program', command: 'winget upgrade --id PACKAGE_ID -e' }
    ],
    placeholders: { PACKAGE_ID: 'The Id from the upgrade list' },
    keywords: [
      'update everything',
      'upgrade all',
      'update my apps',
      'update programs',
      'apt upgrade',
      'brew upgrade',
      'newer version',
      'out of date software',
      'patch'
    ]
  },
  {
    id: 'pkg-winget-list',
    shell: 'any',
    category: 'packages',
    task: 'See which programs are installed (winget)',
    summary: 'Lists installed programs with their versions, including ones that were not installed through winget.',
    command: 'winget list',
    variants: [{ label: 'Only those matching a name', command: 'winget list NAME' }],
    placeholders: { NAME: 'Part of the program name' },
    keywords: [
      'installed programs',
      'what is installed',
      'list apps',
      'is it installed',
      'which version do i have',
      'add remove programs',
      'apt list',
      'installed software'
    ]
  },
  {
    id: 'pkg-winget-uninstall',
    shell: 'any',
    category: 'packages',
    task: 'Uninstall a program (winget)',
    summary: "Removes an installed program, running its own uninstaller. Take the exact Id from winget list.",
    command: 'winget uninstall --id PACKAGE_ID -e',
    placeholders: { PACKAGE_ID: 'The Id from winget list' },
    keywords: [
      'uninstall',
      'remove a program',
      'delete an app',
      'get rid of',
      'apt remove',
      'brew uninstall',
      'remove software'
    ],
    danger: 'The program is removed from the machine, and some uninstallers delete its settings and data with it.'
  },

  // ---- npm: packages for a JavaScript project ----
  {
    id: 'pkg-npm-install',
    shell: 'any',
    category: 'packages',
    task: 'Install what a project needs (npm)',
    summary:
      'Run it in a folder that has a package.json, typically straight after cloning: it downloads every dependency the project lists into node_modules.',
    command: 'npm install',
    variants: [
      { label: 'Exactly the versions in package-lock.json, from scratch (it deletes node_modules first)', command: 'npm ci' },
      { label: 'Start a brand-new project: create a package.json', command: 'npm init -y' }
    ],
    keywords: [
      'npm install',
      'install dependencies',
      'node_modules',
      'after cloning',
      'cannot find module',
      'module not found',
      'set up the project',
      'npm i',
      'yarn',
      'pnpm',
      'package.json'
    ]
  },
  {
    id: 'pkg-npm-add',
    shell: 'any',
    category: 'packages',
    task: 'Add a package to your project (npm)',
    summary: 'Downloads a package and records it under dependencies in package.json, so everyone who installs the project gets it too.',
    command: 'npm install PACKAGE',
    variants: [
      { label: 'A particular version', command: 'npm install PACKAGE@VERSION' },
      { label: 'See what the newest published version is, without installing', command: 'npm view PACKAGE version' }
    ],
    placeholders: { PACKAGE: 'The package name on npmjs.com, such as express', VERSION: 'A version number, such as 4.18.2' },
    keywords: [
      'add a package',
      'add a library',
      'add a dependency',
      'npm i',
      'install a library',
      'yarn add',
      'pnpm add',
      'specific version',
      'latest version of a package'
    ]
  },
  {
    id: 'pkg-npm-dev-dependency',
    shell: 'any',
    category: 'packages',
    task: 'Add a dev-only package (npm)',
    summary:
      'For tools needed while developing but not by the finished program: test runners, linters, TypeScript, bundlers. Recorded under devDependencies.',
    command: 'npm install --save-dev PACKAGE',
    variants: [{ label: 'The short spelling', command: 'npm install -D PACKAGE' }],
    placeholders: { PACKAGE: 'The package name, such as typescript or vitest' },
    keywords: [
      'dev dependency',
      'devdependencies',
      'save-dev',
      'development only',
      'install typescript',
      'install eslint',
      'test framework',
      'yarn add -d',
      'build tool'
    ]
  },
  {
    id: 'pkg-npm-uninstall',
    shell: 'any',
    category: 'packages',
    task: 'Remove a package from your project (npm)',
    summary: 'Deletes the package from node_modules and takes it out of package.json. Putting it back is one npm install away.',
    command: 'npm uninstall PACKAGE',
    placeholders: { PACKAGE: 'The package name' },
    keywords: ['remove a package', 'uninstall a library', 'delete a dependency', 'npm remove', 'npm rm', 'yarn remove', 'unused package']
  },
  {
    id: 'pkg-npm-scripts',
    shell: 'any',
    category: 'packages',
    task: 'See which scripts a project has (npm)',
    summary:
      'With no script name, npm run lists every script defined in package.json (dev, build, test and so on) and the command behind each. The quickest way to learn how a project is started.',
    command: 'npm run',
    keywords: [
      'what scripts exist',
      'list scripts',
      'available commands',
      'how do i start this project',
      'how do i run this',
      'package.json scripts',
      'what can i run',
      'missing script'
    ]
  },
  {
    id: 'pkg-npm-run',
    shell: 'any',
    category: 'packages',
    task: 'Run a project script (npm)',
    summary:
      'Runs one of the scripts from package.json. A dev server keeps running until you press Ctrl+C in its tab.',
    command: 'npm run SCRIPT',
    variants: [
      { label: 'The usual development server', command: 'npm run dev' },
      { label: 'The usual production build', command: 'npm run build' },
      { label: 'test and start need no "run"', command: 'npm test' }
    ],
    placeholders: { SCRIPT: 'A script name from npm run, such as dev or build' },
    keywords: [
      'run a script',
      'start the dev server',
      'npm start',
      'npm run dev',
      'build the project',
      'run the tests',
      'missing script',
      'yarn dev',
      'how do i stop the server'
    ]
  },
  {
    id: 'pkg-npx',
    shell: 'any',
    category: 'packages',
    task: 'Run a package once without installing it (npx)',
    summary:
      'Runs a command that ships inside an npm package. It uses the copy in this project when there is one; otherwise it downloads the package to a cache (asking first) and runs it from there.',
    command: 'npx PACKAGE',
    variants: [
      { label: 'Example: check TypeScript types with the project\'s own compiler', command: 'npx tsc --noEmit' },
      { label: 'Answer yes to the download question in advance', command: 'npx --yes PACKAGE' }
    ],
    placeholders: { PACKAGE: 'The package whose command to run, such as create-vite' },
    keywords: [
      'npx',
      'run without installing',
      'one-off tool',
      'create an app',
      'scaffold',
      'run a local binary',
      'node_modules bin',
      'pnpm dlx',
      'try a package'
    ]
  },
  {
    id: 'pkg-npm-outdated',
    shell: 'any',
    category: 'packages',
    task: 'See which packages have newer versions (npm)',
    summary:
      'Lists each dependency with the version you have, the newest that package.json allows (Wanted) and the newest that exists (Latest). It changes nothing; no output means everything is current.',
    command: 'npm outdated',
    keywords: [
      'outdated',
      'old packages',
      'newer versions',
      'check for updates',
      'what needs updating',
      'dependency versions',
      'wanted latest',
      'stale dependencies'
    ]
  },
  {
    id: 'pkg-npm-update',
    shell: 'any',
    category: 'packages',
    task: 'Update the packages in a project (npm)',
    summary:
      'Moves every dependency to the newest version that the ranges in package.json allow (the Wanted column of npm outdated). It does not jump to a new major version; ask for that by name.',
    command: 'npm update',
    variants: [
      { label: 'Only one package', command: 'npm update PACKAGE' },
      { label: 'Jump one package to the very latest, major versions included', command: 'npm install PACKAGE@latest' }
    ],
    placeholders: { PACKAGE: 'The package name' },
    keywords: [
      'update packages',
      'upgrade dependencies',
      'bump versions',
      'latest',
      'npm upgrade',
      'yarn upgrade',
      'security update',
      'npm audit'
    ]
  },
  {
    id: 'pkg-npm-global',
    shell: 'any',
    category: 'packages',
    task: 'See or install global npm tools',
    summary:
      'Global packages are command-line tools available in every folder (the Codex CLI is one) rather than parts of one project. This lists the ones you have.',
    command: 'npm ls -g --depth=0',
    variants: [
      { label: 'Install a tool globally', command: 'npm install -g PACKAGE' },
      { label: 'Remove one', command: 'npm uninstall -g PACKAGE' },
      { label: 'Where global tools live (that folder must be on PATH)', command: 'npm config get prefix' }
    ],
    placeholders: { PACKAGE: 'The package name, such as @openai/codex' },
    keywords: [
      'global packages',
      'npm list global',
      'globally installed',
      'install -g',
      'cli tools',
      'where are global packages',
      'npm prefix',
      'installed but command not found'
    ]
  },
  {
    id: 'pkg-npm-cache',
    shell: 'any',
    category: 'packages',
    task: 'Clear the npm cache',
    summary:
      'A last resort for installs that fail with integrity or corrupted-download errors. Try the verify variant first: it checks the cache and removes only what is broken or unneeded.',
    command: 'npm cache clean --force',
    variants: [{ label: 'Check and tidy the cache instead of emptying it', command: 'npm cache verify' }],
    keywords: [
      'clear cache',
      'npm cache',
      'integrity check failed',
      'eintegrity',
      'corrupted download',
      'install keeps failing',
      'sha512',
      'free disk space',
      'cache clean'
    ],
    danger: 'Every cached download is deleted; nothing in your projects is touched, but the next installs fetch everything again.'
  },
  // ---- Python: venv and pip ----
  {
    id: 'pkg-venv',
    shell: 'any',
    category: 'packages',
    task: 'Create and activate a Python virtual environment',
    summary:
      "A venv is a private set of Python packages for ONE project, kept in a .venv folder, so projects cannot break each other. Create it once, then activate it in every new terminal tab before working: the prompt shows (.venv) while it is on.",
    command: 'python -m venv .venv',
    variants: [
      { label: 'Activate, in PowerShell', command: '.\\.venv\\Scripts\\Activate.ps1' },
      { label: 'Activate, in bash on Linux or WSL (where the create step is python3 -m venv .venv)', command: 'source .venv/bin/activate' },
      { label: 'Activate, in cmd', command: '.venv\\Scripts\\activate.bat' },
      { label: 'Activate, in Git Bash on Windows', command: 'source .venv/Scripts/activate' },
      { label: 'Switch it off again, in any shell', command: 'deactivate' }
    ],
    keywords: [
      'venv',
      'virtual environment',
      'virtualenv',
      'activate',
      'isolated python',
      'externally-managed-environment',
      'externally managed',
      'conda',
      'python environment',
      'pip installs in the wrong place',
      'no module named',
      'deactivate'
    ]
  },
  {
    id: 'pkg-pip-install',
    shell: 'any',
    category: 'packages',
    task: 'Install a Python package (pip)',
    summary:
      'Installs into the active virtual environment (activate one first). Spelling it python -m pip makes sure the pip belongs to the Python you are actually running. On Ubuntu the command is python3.',
    command: 'python -m pip install PACKAGE',
    variants: [
      { label: 'A particular version', command: 'python -m pip install PACKAGE==VERSION' },
      { label: 'Upgrade one you already have', command: 'python -m pip install --upgrade PACKAGE' },
      { label: 'Remove one', command: 'python -m pip uninstall PACKAGE' }
    ],
    placeholders: { PACKAGE: 'The package name on pypi.org, such as requests', VERSION: 'A version number, such as 2.32.0' },
    keywords: [
      'pip install',
      'install a python library',
      'modulenotfounderror',
      'no module named',
      'importerror',
      'pip3',
      'pypi',
      'python package',
      'upgrade a package',
      'pip is not recognized'
    ]
  },
  {
    id: 'pkg-pip-requirements',
    shell: 'any',
    category: 'packages',
    task: 'Install everything in requirements.txt (pip)',
    summary:
      'Python projects list what they need in requirements.txt. After cloning one: create and activate a venv, then run this.',
    command: 'python -m pip install -r requirements.txt',
    keywords: [
      'requirements.txt',
      'install requirements',
      'install dependencies python',
      'after cloning',
      'set up a python project',
      'pip -r',
      'project dependencies',
      'pyproject'
    ]
  },
  {
    id: 'pkg-pip-freeze',
    shell: 'any',
    category: 'packages',
    task: 'Save the installed packages to requirements.txt',
    summary:
      'Writes every package in the active environment, with its exact version, to requirements.txt, so someone else (or you, later) can recreate it. Do it inside the venv, or the file lists your whole machine.',
    command: 'python -m pip freeze > requirements.txt',
    variants: [{ label: 'Only print the list, write nothing', command: 'python -m pip freeze' }],
    keywords: [
      'freeze',
      'pip freeze',
      'export dependencies',
      'create requirements.txt',
      'lock versions',
      'save packages',
      'pin versions',
      'share my environment'
    ],
    danger: 'An existing requirements.txt in this folder is overwritten.'
  },
  {
    id: 'pkg-pip-list',
    shell: 'any',
    category: 'packages',
    task: 'See which Python packages are installed (pip)',
    summary: 'Lists the packages in the active environment with their versions.',
    command: 'python -m pip list',
    variants: [
      { label: 'Only those with a newer version available', command: 'python -m pip list --outdated' },
      { label: 'Details of one package: version, location, what it depends on', command: 'python -m pip show PACKAGE' },
      { label: 'Which Python and which pip this shell is using', command: 'python -m pip --version' }
    ],
    placeholders: { PACKAGE: 'The package name' },
    keywords: [
      'pip list',
      'installed python packages',
      'which version of a library',
      'is it installed',
      'outdated python packages',
      'pip show',
      'which python',
      'python version'
    ]
  },

  // ---- The one everybody hits ----
  {
    id: 'pkg-command-not-found',
    shell: 'any',
    category: 'packages',
    task: 'Fix "command not found" right after installing',
    summary:
      'A shell reads PATH, the list of folders it looks for programs in, once, when it starts, and an installer changes PATH for shells started AFTER it. So first close this tab and open a new one. This command then shows where Windows finds the program: no result means its folder is not on PATH (or, for a global npm tool, see npm config get prefix).',
    command: 'where.exe NAME',
    variants: [
      { label: 'In bash', command: 'which NAME' },
      {
        label: 'PowerShell: re-read PATH in this tab without restarting it',
        command:
          '$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")'
      }
    ],
    placeholders: { NAME: 'The command that is not found, such as node or claude' },
    keywords: [
      'command not found',
      'is not recognized as an internal or external command',
      'is not recognized as the name of a cmdlet',
      'not recognized',
      'just installed but not found',
      'restart the terminal',
      'path',
      'refresh path',
      'refreshenv',
      'where is it installed',
      'which'
    ]
  }
]
