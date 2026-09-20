/**
 * THE HELP CATALOGUE, bash: WSL, Linux and Git Bash (#12).
 *
 * Written for a Windows user who has landed in Ubuntu under WSL, usually to run
 * an agent there: the everyday file and folder work, finding text, processes
 * and ports, apt, the environment and ~/.bashrc, and the WSL seams a Windows
 * user trips on (the drives under /mnt/c, explorer.exe, line endings, chmod +x).
 * What is run from the WINDOWS side (wsl --shutdown, wsl -l -v) lives with the
 * PowerShell and cmd entries, not here. The keywords carry the Windows names
 * ("dir", "findstr", "tasklist") because that is what this reader knows.
 *
 * HOW THESE WERE CHECKED (2026-09-20): this machine has WSL but no distribution
 * installed, so the commands were RUN in Git Bash (GNU coreutils, the same
 * ls/cp/find/grep/sed/tar/du/df) inside a scratch folder made for the purpose:
 * every file, folder, text, redirection, chaining, environment, PATH, alias,
 * jobs and kill entry, plus curl, ssh -V, file and the CRLF fix. NOT RUN, since
 * Git Bash does not ship them, and written from the tools' documented
 * behaviour on Ubuntu: apt, sudo, man, lsof, ss, ip, pgrep and pkill, top,
 * free, lsb_release, getent, wget, zip, wslpath, /mnt/c and the .exe interop.
 * Where a tool is not in a stock Ubuntu image (unzip, zip, tree, dos2unix) the
 * summary says so and gives the apt line.
 */

import type { HelpEntry } from './types'

export const BASH_HELP: readonly HelpEntry[] = [
  // ---------------------------------------------------------------- folders
  {
    id: 'sh-where-am-i',
    shell: 'bash',
    category: 'folders',
    task: 'See which folder I am in',
    summary: 'Prints the full path of the current folder ("print working directory").',
    command: 'pwd',
    keywords: [
      'where am i',
      'current folder',
      'current directory',
      'working directory',
      'pwd',
      'get-location',
      'cd with no arguments',
      'which folder'
    ]
  },
  {
    id: 'sh-change-folder',
    shell: 'bash',
    category: 'folders',
    task: 'Go to another folder',
    summary:
      'Moves into a folder. Names are case-sensitive here (Documents is not documents), and the slashes lean forward.',
    command: 'cd FOLDER',
    variants: [
      { label: 'Your home folder', command: 'cd ~' },
      { label: 'Back to the folder you were in just before', command: 'cd -' },
      { label: 'A folder with spaces in its name: keep the quotes', command: 'cd "FOLDER"' }
    ],
    placeholders: { FOLDER: 'The folder to go to, for example ~/projects/site' },
    keywords: [
      'cd',
      'change directory',
      'change folder',
      'go to folder',
      'navigate',
      'set-location',
      'home folder',
      'tilde',
      'no such file or directory',
      'previous folder'
    ]
  },
  {
    id: 'sh-go-up',
    shell: 'bash',
    category: 'folders',
    task: 'Go back up a folder',
    summary:
      'Two dots mean "the folder that holds this one". The space after cd is required here, unlike in Command Prompt.',
    command: 'cd ..',
    variants: [{ label: 'Up two levels', command: 'cd ../..' }],
    keywords: [
      'go back',
      'back a folder',
      'parent folder',
      'up one level',
      'cd ..',
      'cd..',
      'dot dot',
      'leave folder',
      'command not found cd..'
    ]
  },
  {
    id: 'sh-windows-drives',
    shell: 'bash',
    category: 'folders',
    task: 'Reach my Windows files from WSL',
    summary:
      'WSL mounts each Windows drive under /mnt by its letter, so C:\\Users is /mnt/c/Users. It works, but it is slow: keep projects you build in WSL inside the Linux home folder instead.',
    command: 'cd /mnt/c/Users/NAME',
    variants: [
      { label: 'See which drives are mounted', command: 'ls /mnt' },
      {
        label: 'Turn a Windows path into the Linux one',
        command: "wslpath 'C:\\Users\\NAME\\Documents'"
      },
      { label: 'Turn the current folder into a Windows path', command: 'wslpath -w .' }
    ],
    placeholders: { NAME: 'Your Windows user name' },
    keywords: [
      'mnt c',
      '/mnt/c',
      'c drive',
      'windows files',
      'windows drive',
      'access windows from wsl',
      'wslpath',
      'convert path',
      'where are my documents',
      'desktop folder',
      'downloads'
    ]
  },
  {
    id: 'sh-open-explorer',
    shell: 'bash',
    category: 'folders',
    task: 'Open this folder in File Explorer',
    summary:
      'WSL can start Windows programs by their .exe name. The dot means "here", so Explorer opens on the current Linux folder (under \\\\wsl.localhost).',
    command: 'explorer.exe .',
    variants: [
      { label: 'Open this folder in VS Code', command: 'code .' },
      { label: 'Open a file in Notepad', command: 'notepad.exe FILE' }
    ],
    placeholders: { FILE: 'A file in the current folder' },
    keywords: [
      'explorer',
      'file explorer',
      'open folder',
      'open in explorer',
      'show in explorer',
      'start .',
      'xdg-open',
      'see linux files in windows',
      'wsl$',
      'vs code',
      'run windows program'
    ]
  },
  {
    id: 'sh-make-folder',
    shell: 'bash',
    category: 'folders',
    task: 'Make a new folder',
    summary:
      '-p makes any missing folders on the way, and does not complain if the folder is already there.',
    command: 'mkdir -p NAME',
    variants: [{ label: 'Several levels at once', command: 'mkdir -p PARENT/CHILD/GRANDCHILD' }],
    placeholders: {
      NAME: 'The new folder',
      PARENT: 'The outer folder',
      CHILD: 'A folder inside it',
      GRANDCHILD: 'A folder inside that'
    },
    keywords: [
      'mkdir',
      'md',
      'create folder',
      'new folder',
      'make directory',
      'new directory',
      'new-item',
      'nested folders'
    ]
  },
  {
    id: 'sh-delete-folder',
    shell: 'bash',
    category: 'folders',
    task: 'Delete a folder and everything in it',
    summary:
      '-r means "and everything inside". Read the path twice before pressing Enter, and never run it on a path built from a variable that might be empty.',
    command: 'rm -r FOLDER',
    variants: [
      { label: 'Only if it is empty (the safe form)', command: 'rmdir FOLDER' },
      { label: 'Without any questions, write-protected files included', command: 'rm -rf FOLDER' }
    ],
    placeholders: { FOLDER: 'The folder to remove' },
    keywords: [
      'rm -rf',
      'rmdir',
      'remove folder',
      'delete directory',
      'rd /s',
      'remove-item -recurse',
      'directory not empty',
      'is a directory',
      'delete node_modules'
    ],
    danger:
      'There is no Recycle Bin in Linux. The folder and everything inside it is gone for good.'
  },
  {
    id: 'sh-folder-size',
    shell: 'bash',
    category: 'folders',
    task: 'See how big a folder is',
    summary:
      '-s gives one total instead of a line per subfolder, and -h prints it in K, M and G rather than blocks.',
    command: 'du -sh FOLDER',
    variants: [
      { label: 'Each thing in this folder, smallest to biggest', command: 'du -sh * | sort -h' },
      { label: 'One level of subfolders only', command: 'du -h --max-depth=1 .' }
    ],
    placeholders: { FOLDER: 'The folder to measure, or . for the current one' },
    keywords: [
      'du',
      'du -sh',
      'folder size',
      'directory size',
      'how big',
      'disk usage',
      'space used',
      'what is taking up space',
      'total size'
    ]
  },
  {
    id: 'sh-tree',
    shell: 'bash',
    category: 'folders',
    task: 'Show the folder structure',
    summary:
      'Lists the folders two levels down using find, which is always there. The prettier tree command is not installed on a stock Ubuntu: sudo apt install tree.',
    command: 'find . -maxdepth 2 -type d',
    variants: [{ label: 'With tree, once installed', command: 'tree -L 2' }],
    keywords: [
      'tree',
      'folder structure',
      'directory structure',
      'project layout',
      'list subfolders',
      'show hierarchy',
      'tree command not found'
    ]
  },

  // ------------------------------------------------------------------ files
  {
    id: 'sh-list-files',
    shell: 'bash',
    category: 'files',
    task: 'List the files in this folder',
    summary:
      '-l shows sizes, dates and permissions, -a includes hidden files, and -h prints sizes in K, M and G.',
    command: 'ls -lah',
    variants: [
      { label: 'Names only', command: 'ls' },
      { label: 'Newest first', command: 'ls -lt' },
      { label: 'Biggest first', command: 'ls -lhS' }
    ],
    keywords: [
      'ls',
      'dir',
      'list files',
      'show files',
      'what is in this folder',
      'get-childitem',
      'll',
      'sort by date',
      'sort by size',
      'newest files'
    ]
  },
  {
    id: 'sh-hidden-files',
    shell: 'bash',
    category: 'files',
    task: 'See hidden files too',
    summary:
      'In Linux a file is hidden simply because its name starts with a dot (.env, .git, .bashrc). -a lists those as well.',
    command: 'ls -a',
    keywords: [
      'hidden files',
      'show hidden',
      'dotfiles',
      'dot files',
      'dir /a',
      'get-childitem -force',
      '.env missing',
      'where is .bashrc',
      'invisible files'
    ]
  },
  {
    id: 'sh-read-file',
    shell: 'bash',
    category: 'files',
    task: 'Read a text file in the terminal',
    summary:
      'cat prints the whole file. For a long one use less: arrows and Page Down to move, / to search, Q to leave.',
    command: 'cat FILE',
    variants: [
      { label: 'Scroll through a long file (Q to leave)', command: 'less FILE' },
      { label: 'Only the first 20 lines', command: 'head -n 20 FILE' },
      { label: 'Only the last 20 lines', command: 'tail -n 20 FILE' }
    ],
    placeholders: { FILE: 'The file to read' },
    keywords: [
      'cat',
      'type',
      'read file',
      'show file',
      'print file',
      'view contents',
      'get-content',
      'less',
      'more',
      'head',
      'tail',
      'how do i exit less'
    ]
  },
  {
    id: 'sh-follow-log',
    shell: 'bash',
    category: 'files',
    task: 'Watch a log file as it grows',
    summary:
      'Prints the end of the file and then every new line as it is written. Ctrl+C stops watching.',
    command: 'tail -f FILE',
    placeholders: { FILE: 'The log file' },
    keywords: [
      'tail -f',
      'follow log',
      'watch file',
      'live log',
      'get-content -wait',
      'stream log',
      'monitor file',
      'log output'
    ]
  },
  {
    id: 'sh-make-file',
    shell: 'bash',
    category: 'files',
    task: 'Make a new empty file',
    summary:
      'Creates the file if it is missing. If it already exists its contents are left alone and only its date changes.',
    command: 'touch NAME',
    variants: [
      {
        label: 'A file with one line of text in it (REPLACES the file if it exists)',
        command: 'echo "TEXT" > NAME'
      }
    ],
    placeholders: {
      NAME: 'The file to create, for example notes.txt',
      TEXT: 'The first line of the file'
    },
    keywords: [
      'touch',
      'create file',
      'new file',
      'make file',
      'empty file',
      'new-item',
      'type nul',
      'blank file',
      'create .env'
    ]
  },
  {
    id: 'sh-edit-file',
    shell: 'bash',
    category: 'files',
    task: 'Edit a file in the terminal',
    summary:
      'nano is the friendly editor: type as normal, Ctrl+O then Enter saves, Ctrl+X leaves. The shortcuts are listed along the bottom, where ^ means Ctrl.',
    command: 'nano FILE',
    variants: [
      { label: 'In VS Code instead', command: 'code FILE' },
      {
        label: 'Stuck in vim? Press Esc, then type this and Enter to leave without saving',
        command: ':q!'
      }
    ],
    placeholders: { FILE: 'The file to edit (it is created if missing)' },
    keywords: [
      'nano',
      'edit file',
      'text editor',
      'notepad',
      'vim',
      'vi',
      'how do i exit vim',
      'quit vim',
      'save in nano',
      'open file to edit'
    ]
  },
  {
    id: 'sh-copy',
    shell: 'bash',
    category: 'files',
    task: 'Copy a file or a folder',
    summary:
      'Copies a file to a new name or into a folder. A folder needs -r ("and everything inside").',
    command: 'cp SOURCE DESTINATION',
    variants: [
      { label: 'A whole folder', command: 'cp -r SOURCE DESTINATION' },
      { label: 'Ask before replacing anything', command: 'cp -i SOURCE DESTINATION' }
    ],
    placeholders: {
      SOURCE: 'What to copy',
      DESTINATION: 'A folder to copy it into, or the new name'
    },
    keywords: [
      'cp',
      'copy',
      'copy file',
      'copy folder',
      'cp -r',
      'robocopy',
      'xcopy',
      'copy-item',
      'duplicate',
      'back up a file',
      'omitting directory'
    ],
    danger:
      'A file of the same name at the destination is replaced without asking, unless you add -i.'
  },
  {
    id: 'sh-move-rename',
    shell: 'bash',
    category: 'files',
    task: 'Move or rename a file or folder',
    summary:
      'Linux has one command for both: moving a file to a new name in the same folder IS renaming it.',
    command: 'mv SOURCE DESTINATION',
    variants: [{ label: 'Ask before replacing anything', command: 'mv -i SOURCE DESTINATION' }],
    placeholders: {
      SOURCE: 'The file or folder as it is now',
      DESTINATION: 'The new name, or the folder to move it into'
    },
    keywords: [
      'mv',
      'move',
      'rename',
      'ren',
      'move-item',
      'rename-item',
      'change file name',
      'put file in folder',
      'relocate'
    ],
    danger:
      'A file of the same name at the destination is replaced without asking, unless you add -i.'
  },
  {
    id: 'sh-delete-file',
    shell: 'bash',
    category: 'files',
    task: 'Delete a file',
    summary:
      'Removes the file. A wildcard removes every match, so run ls with the same pattern first to see what it will take.',
    command: 'rm FILE',
    variants: [
      { label: 'Ask about each one first', command: 'rm -i FILE' },
      { label: 'Every file of one type in this folder', command: 'rm *.EXT' }
    ],
    placeholders: { FILE: 'The file to delete', EXT: 'The file extension, for example log' },
    keywords: [
      'rm',
      'del',
      'erase',
      'delete file',
      'remove file',
      'remove-item',
      'get rid of file',
      'unlink'
    ],
    danger: 'There is no Recycle Bin in Linux. A deleted file is gone for good.'
  },
  {
    id: 'sh-find-file-by-name',
    shell: 'bash',
    category: 'files',
    task: 'Find a file by name, in this folder and below',
    summary:
      'Searches every subfolder. -iname ignores upper and lower case and the stars mean "anything", so part of the name is enough. Keep the quotes, or the shell expands the stars itself.',
    command: 'find . -iname "*NAME*"',
    variants: [
      {
        label: 'Files only, and hide the "Permission denied" noise',
        command: 'find . -type f -iname "*NAME*" 2>/dev/null'
      },
      { label: 'Changed in the last day', command: 'find . -type f -mtime -1' },
      { label: 'Changed in the last hour', command: 'find . -type f -mmin -60' }
    ],
    placeholders: { NAME: 'Any part of the file name' },
    keywords: [
      'find',
      'find file',
      'search for file',
      'locate',
      'where is my file',
      'dir /s',
      'get-childitem -recurse',
      'recently changed files',
      'modified today',
      'wildcard'
    ]
  },
  {
    id: 'sh-biggest-files',
    shell: 'bash',
    category: 'files',
    task: 'Find the biggest files and folders here',
    summary:
      'Measures everything under this folder, sorts by size with the biggest on top, and keeps the first twenty.',
    command: 'du -ah . | sort -rh | head -n 20',
    keywords: [
      'big files',
      'biggest files',
      'largest files',
      'what is using disk space',
      'disk full',
      'no space left on device',
      'find large files',
      'clean up space',
      'du sort'
    ]
  },
  {
    id: 'sh-make-executable',
    shell: 'bash',
    category: 'files',
    task: 'Run a script that says "Permission denied"',
    summary:
      'A script has to be marked executable before ./ will run it. Do that once, then start it with ./ in front: Linux does not look in the current folder for commands by itself.',
    command: 'chmod +x SCRIPT.sh',
    variants: [
      { label: 'Then run it', command: './SCRIPT.sh' },
      { label: 'Or run it without marking it', command: 'bash SCRIPT.sh' }
    ],
    placeholders: { SCRIPT: 'The name of the script file' },
    keywords: [
      'chmod',
      'chmod +x',
      'permission denied',
      'make executable',
      'run script',
      'run sh file',
      'dot slash',
      './',
      'command not found script',
      'execute bit'
    ]
  },
  {
    id: 'sh-permissions',
    shell: 'bash',
    category: 'files',
    task: 'See or fix who may read and write a file',
    summary:
      'The first column of ls -l reads r (read), w (write), x (run) three times over: for the owner, the group, and everyone else. The name after it is the owner.',
    command: 'ls -l FILE',
    variants: [
      { label: 'Give yourself read and write on a whole folder', command: 'chmod -R u+rwX FOLDER' },
      {
        label: 'Take a folder back that sudo left owned by root',
        command: 'sudo chown -R $USER FOLDER'
      },
      {
        label: 'What an SSH private key needs (it is refused otherwise)',
        command: 'chmod 600 ~/.ssh/id_ed25519'
      }
    ],
    placeholders: { FILE: 'The file to look at', FOLDER: 'The folder to fix' },
    keywords: [
      'permissions',
      'chmod',
      'chown',
      'permission denied',
      'access denied',
      'read only',
      'owned by root',
      'eacces',
      'icacls',
      'unprotected private key file',
      'file mode'
    ]
  },
  {
    id: 'sh-line-endings',
    shell: 'bash',
    category: 'files',
    task: 'Fix a script broken by Windows line endings',
    summary:
      'A file saved on Windows ends its lines with CR LF, and bash reads the CR as part of the command: "bad interpreter: /bin/bash^M" or "$\'\\r\': command not found". This strips the CR from every line.',
    command: "sed -i 's/\\r$//' FILE",
    variants: [
      { label: 'Check first: it says "with CRLF line terminators" if so', command: 'file FILE' },
      { label: 'The dedicated tool (sudo apt install dos2unix)', command: 'dos2unix FILE' },
      {
        label: 'Stop git converting line endings on checkout',
        command: 'git config --global core.autocrlf input'
      }
    ],
    placeholders: { FILE: 'The script or text file to fix' },
    keywords: [
      'line endings',
      'crlf',
      'lf',
      'carriage return',
      'bad interpreter',
      '^m',
      '\\r command not found',
      'dos2unix',
      'windows line endings',
      'script wont run in wsl',
      'autocrlf'
    ],
    danger:
      'The file is rewritten in place. Harmless for text and scripts, but never run it on a binary file.'
  },
  {
    id: 'sh-tar-extract',
    shell: 'bash',
    category: 'files',
    task: 'Unpack a .tar.gz archive',
    summary:
      'x extracts, f names the file, and modern tar works out the compression (.gz, .bz2, .xz) by itself.',
    command: 'tar -xf FILE.tar.gz',
    variants: [
      { label: 'Into another folder (it must exist)', command: 'tar -xf FILE.tar.gz -C FOLDER' },
      { label: 'Just list what is inside', command: 'tar -tf FILE.tar.gz' }
    ],
    placeholders: { FILE: 'The archive, without its ending', FOLDER: 'Where to unpack it' },
    keywords: [
      'tar',
      'untar',
      'extract',
      'unpack',
      'tar.gz',
      'tgz',
      'tarball',
      'expand-archive',
      'decompress',
      'gunzip'
    ],
    danger: 'Files already there with the same names are replaced without asking.'
  },
  {
    id: 'sh-tar-create',
    shell: 'bash',
    category: 'files',
    task: 'Pack a folder into a .tar.gz archive',
    summary:
      'c creates, z compresses with gzip, f names the archive. The folder itself is left as it is.',
    command: 'tar -czf NAME.tar.gz FOLDER',
    placeholders: { NAME: 'What to call the archive', FOLDER: 'The folder to pack' },
    keywords: [
      'tar',
      'compress',
      'archive folder',
      'make tarball',
      'tar.gz',
      'compress-archive',
      'back up folder',
      'gzip'
    ],
    danger: 'An archive of the same name is replaced without asking.'
  },
  {
    id: 'sh-unzip',
    shell: 'bash',
    category: 'files',
    task: 'Unzip a .zip file',
    summary:
      'Unpacks into the folder named after -d, making it if needed. A stock Ubuntu has neither unzip nor zip: sudo apt install unzip zip.',
    command: 'unzip FILE.zip -d FOLDER',
    variants: [
      { label: 'Just list what is inside', command: 'unzip -l FILE.zip' },
      { label: 'Make a zip of a folder', command: 'zip -r NAME.zip FOLDER' }
    ],
    placeholders: {
      FILE: 'The zip, without its ending',
      FOLDER: 'Where to unpack, or what to pack',
      NAME: 'What to call the new zip'
    },
    keywords: [
      'unzip',
      'zip',
      'extract zip',
      'expand-archive',
      'compress-archive',
      'unzip command not found',
      'open zip',
      'decompress'
    ]
  },

  // ------------------------------------------------------------------- text
  {
    id: 'sh-grep-recursive',
    shell: 'bash',
    category: 'text',
    task: 'Find text inside files',
    summary:
      '-r searches this folder and every subfolder, -n shows the line number and -i ignores upper and lower case.',
    command: 'grep -rni "TEXT" .',
    variants: [
      { label: 'Just the names of the files that contain it', command: 'grep -rli "TEXT" .' },
      { label: 'Only in one type of file', command: 'grep -rni --include="*.EXT" "TEXT" .' },
      { label: 'Skip node_modules', command: 'grep -rni --exclude-dir=node_modules "TEXT" .' }
    ],
    placeholders: { TEXT: 'The words to look for', EXT: 'The file extension, for example ts' },
    keywords: [
      'grep',
      'grep -r',
      'findstr',
      'select-string',
      'search in files',
      'find text',
      'find string',
      'search code',
      'which file contains',
      'find word'
    ]
  },
  {
    id: 'sh-filter-output',
    shell: 'bash',
    category: 'text',
    task: 'Show only the lines of output that mention something',
    summary: 'Pipes a command into grep so a long list is cut down to the lines you care about.',
    command: 'COMMAND | grep -i "TEXT"',
    variants: [{ label: 'The lines that do NOT mention it', command: 'COMMAND | grep -iv "TEXT"' }],
    placeholders: {
      COMMAND: 'Any command that prints a lot, for example ps aux',
      TEXT: 'The word to keep'
    },
    keywords: [
      'filter output',
      'grep',
      'pipe to grep',
      'search output',
      'where-object',
      'findstr',
      'only matching lines',
      'too much output'
    ]
  },
  {
    id: 'sh-count-lines',
    shell: 'bash',
    category: 'text',
    task: 'Count lines, words or files',
    summary:
      'wc -l counts lines, and anything can be piped into it: count the files here, the matches of a grep, and so on.',
    command: 'wc -l FILE',
    variants: [
      { label: 'How many things are in this folder', command: 'ls | wc -l' },
      { label: 'Words rather than lines', command: 'wc -w FILE' }
    ],
    placeholders: { FILE: 'The file to count' },
    keywords: [
      'wc',
      'count lines',
      'line count',
      'how many lines',
      'how many files',
      'word count',
      'measure-object',
      'find /c'
    ]
  },
  {
    id: 'sh-compare-files',
    shell: 'bash',
    category: 'text',
    task: 'Compare two files',
    summary:
      'Lines starting - are only in the first file, lines starting + only in the second. No output at all means they are the same.',
    command: 'diff -u FILE1 FILE2',
    variants: [{ label: 'Two whole folders', command: 'diff -rq FOLDER1 FOLDER2' }],
    placeholders: {
      FILE1: 'The first file',
      FILE2: 'The second file',
      FOLDER1: 'The first folder',
      FOLDER2: 'The second folder'
    },
    keywords: [
      'diff',
      'compare files',
      'fc',
      'compare-object',
      'what changed',
      'are these the same',
      'differences',
      'compare folders'
    ]
  },
  {
    id: 'sh-replace-text',
    shell: 'bash',
    category: 'text',
    task: 'Replace a word throughout a file',
    summary:
      's/OLD/NEW/g swaps every OLD for NEW, and -i writes the result back into the file. Run the preview variant first: it only prints.',
    command: "sed -i 's/OLD/NEW/g' FILE",
    variants: [
      { label: 'Preview: print the result, change nothing', command: "sed 's/OLD/NEW/g' FILE" }
    ],
    placeholders: {
      OLD: 'The text to find (a / or a . in it needs a backslash in front)',
      NEW: 'What to put in its place',
      FILE: 'The file to change'
    },
    keywords: [
      'sed',
      'replace text',
      'find and replace',
      'search and replace',
      'substitute',
      'rename variable',
      '-replace',
      'change word in file'
    ],
    danger:
      'The file is changed in place with no backup. Use sed -i.bak to keep the original as FILE.bak.'
  },
  {
    id: 'sh-sort-unique',
    shell: 'bash',
    category: 'text',
    task: 'Sort lines and count the duplicates',
    summary:
      'Sorts the lines, folds identical ones together with a count, and puts the most frequent on top.',
    command: 'sort FILE | uniq -c | sort -nr',
    variants: [{ label: 'Just sort and drop the duplicates', command: 'sort -u FILE' }],
    placeholders: { FILE: 'The file to sort' },
    keywords: [
      'sort',
      'uniq',
      'unique lines',
      'remove duplicates',
      'count occurrences',
      'most common',
      'sort-object',
      'group-object',
      'dedupe'
    ]
  },
  {
    id: 'sh-pick-column',
    shell: 'bash',
    category: 'text',
    task: 'Keep one column of some output',
    summary:
      'awk splits each line on spaces and $2 is the second piece. For comma-separated text use cut.',
    command: "COMMAND | awk '{print $2}'",
    variants: [
      { label: 'The second field of comma-separated lines', command: "cut -d',' -f2 FILE" }
    ],
    placeholders: {
      COMMAND: 'Any command that prints columns, for example ps aux',
      FILE: 'A CSV file'
    },
    keywords: [
      'awk',
      'cut',
      'column',
      'field',
      'extract column',
      'select-object',
      'csv column',
      'split line',
      'second word'
    ]
  },

  // -------------------------------------------------------------- processes
  {
    id: 'sh-list-processes',
    shell: 'bash',
    category: 'processes',
    task: 'See what is running',
    summary:
      'Lists every process with its owner, its PID (the number you need to stop it), and its CPU and memory share.',
    command: 'ps aux',
    variants: [
      { label: 'Only the ones mentioning a name', command: 'ps aux | grep -i NAME' },
      { label: 'Just PIDs and command lines for a name', command: 'pgrep -fl NAME' },
      { label: 'A live view, busiest first (Q to leave)', command: 'top' }
    ],
    placeholders: { NAME: 'The program, for example node' },
    keywords: [
      'ps',
      'ps aux',
      'tasklist',
      'get-process',
      'running programs',
      'processes',
      'task manager',
      'top',
      'htop',
      'is node running',
      'pid',
      'cpu usage'
    ]
  },
  {
    id: 'sh-kill-process',
    shell: 'bash',
    category: 'processes',
    task: 'Stop a program by its PID or name',
    summary:
      'Plain kill asks the program to stop and lets it tidy up. Reach for -9 only when it ignores that: -9 cannot be refused and nothing gets saved.',
    command: 'kill PID',
    variants: [
      { label: 'Force it, when asking did not work', command: 'kill -9 PID' },
      { label: 'Every process with this name', command: 'pkill NAME' },
      { label: 'Anything whose command line mentions a word', command: 'pkill -f TEXT' }
    ],
    placeholders: {
      PID: 'The number from ps aux or lsof',
      NAME: 'The program name, for example node',
      TEXT: 'Part of the command line, for example vite'
    },
    keywords: [
      'kill',
      'kill -9',
      'pkill',
      'killall',
      'taskkill',
      'stop-process',
      'stop program',
      'end task',
      'frozen',
      'not responding',
      'kill node'
    ],
    danger:
      'The program stops without the chance to save, and pkill stops EVERY match, not just one.'
  },
  {
    id: 'sh-port-in-use',
    shell: 'bash',
    category: 'processes',
    task: 'Find what is using a port',
    summary:
      'Names the program and PID holding the port. No output means nothing of YOURS holds it: put sudo in front to see other users. The ss variant is always installed, should lsof be missing.',
    command: 'lsof -i :PORT',
    variants: [
      { label: 'Everything that is listening, with the program names', command: 'ss -ltnp' },
      { label: 'Just that port, with ss', command: 'ss -ltnp | grep :PORT' }
    ],
    placeholders: { PORT: 'The port number, for example 3000' },
    keywords: [
      'port in use',
      'port already in use',
      'eaddrinuse',
      'address already in use',
      'what is using port 3000',
      'lsof',
      'lsof -i',
      'netstat',
      'ss',
      'listening ports',
      'free a port'
    ]
  },
  {
    id: 'sh-cancel-command',
    shell: 'bash',
    category: 'processes',
    task: 'Stop a command that is still running',
    summary:
      'Not a command but a key: hold Ctrl and press C. If the program ignores it, Ctrl+Z parks it and hands the prompt back, and the variant then finishes it off.',
    command: 'Ctrl+C',
    variants: [
      { label: 'After Ctrl+Z: force-stop the job you just parked', command: 'kill -9 %1' }
    ],
    keywords: [
      'cancel',
      'stop',
      'abort',
      'interrupt',
      'ctrl c',
      'ctrl z',
      'how do i stop this',
      'stuck',
      'hung',
      'wont stop',
      'exit running command',
      'sigint'
    ],
    danger: 'The kill variant stops the parked program without the chance to save.'
  },
  {
    id: 'sh-background-jobs',
    shell: 'bash',
    category: 'processes',
    task: 'Run something in the background',
    summary:
      'An & at the end starts the command and hands the prompt straight back. jobs lists what this shell has running, and fg brings one to the front again.',
    command: 'COMMAND &',
    variants: [
      { label: 'List the background jobs of this shell', command: 'jobs' },
      { label: 'Bring the last one back to the front', command: 'fg' },
      { label: 'Let a job parked with Ctrl+Z carry on in the background', command: 'bg' },
      {
        label: 'Keep it running after the terminal closes',
        command: 'nohup COMMAND > output.log 2>&1 &'
      }
    ],
    placeholders: { COMMAND: 'The command to run, for example npm run dev' },
    keywords: [
      'background',
      'ampersand',
      'jobs',
      'fg',
      'bg',
      'nohup',
      'start-job',
      'start /b',
      'keep running after close',
      'ctrl z',
      'suspended',
      'there are stopped jobs'
    ]
  },

  // ---------------------------------------------------------------- network
  {
    id: 'sh-ip-address',
    shell: 'bash',
    category: 'network',
    task: 'Find my IP address',
    summary:
      "Prints this machine's addresses. Under WSL that is the Linux side's own address, which is usually not the one Windows has on your network.",
    command: 'hostname -I',
    variants: [
      { label: 'Every network interface in full', command: 'ip addr' },
      { label: 'The address the internet sees', command: 'curl -s https://ifconfig.me' }
    ],
    keywords: [
      'ip address',
      'my ip',
      'local ip',
      'ipconfig',
      'ifconfig',
      'ip addr',
      'public ip',
      'wsl ip',
      'network interface'
    ]
  },
  {
    id: 'sh-ping',
    shell: 'bash',
    category: 'network',
    task: 'Check whether a site or machine can be reached',
    summary:
      'Linux ping goes on for ever unless told otherwise, so -c 4 sends four packets and stops.',
    command: 'ping -c 4 HOST',
    variants: [{ label: 'Look the name up (DNS and /etc/hosts)', command: 'getent hosts HOST' }],
    placeholders: { HOST: 'A name or an address, for example github.com' },
    keywords: [
      'ping',
      'is the internet working',
      'connection test',
      'test-connection',
      'dns lookup',
      'nslookup',
      'site down',
      'no internet',
      'ping never stops',
      'temporary failure in name resolution'
    ]
  },
  {
    id: 'sh-download',
    shell: 'bash',
    category: 'network',
    task: 'Download a file from a URL',
    summary:
      '-L follows redirects (most download links have one) and -O keeps the name the file has on the server.',
    command: 'curl -L -O URL',
    variants: [
      { label: 'Choose the name to save it under', command: 'curl -L -o FILE URL' },
      { label: 'The same with wget', command: 'wget URL' }
    ],
    placeholders: {
      URL: 'The full address, starting https://',
      FILE: 'What to call the saved file'
    },
    keywords: [
      'curl',
      'wget',
      'download',
      'fetch url',
      'invoke-webrequest',
      'save file from internet',
      'get file',
      'download script'
    ]
  },
  {
    id: 'sh-check-server',
    shell: 'bash',
    category: 'network',
    task: 'Check that a website or my local server answers',
    summary:
      '-I asks for the headers only, so the first line is the verdict: 200 is fine, 404 not found, "Connection refused" means nothing is listening there.',
    command: 'curl -I http://localhost:PORT',
    variants: [
      { label: 'Show the reply body as well as the headers', command: 'curl -i URL' },
      {
        label: 'Send JSON to an API',
        command: 'curl -X POST -H "Content-Type: application/json" -d \'{"KEY":"VALUE"}\' URL'
      }
    ],
    placeholders: {
      PORT: 'The port your server runs on, for example 3000',
      URL: 'The full address',
      KEY: 'A field name in the JSON',
      VALUE: 'Its value'
    },
    keywords: [
      'curl',
      'http request',
      'test api',
      'is my server running',
      'localhost',
      'connection refused',
      'status code',
      'post json',
      'invoke-restmethod',
      'headers'
    ]
  },
  {
    id: 'sh-ssh',
    shell: 'bash',
    category: 'network',
    task: 'Log in to another machine over SSH',
    summary: 'Opens a shell on the remote machine. exit, or Ctrl+D, brings you back.',
    command: 'ssh USER@HOST',
    variants: [
      { label: 'On a port other than 22', command: 'ssh -p PORT USER@HOST' },
      { label: 'With a particular key file', command: 'ssh -i ~/.ssh/KEYFILE USER@HOST' },
      { label: 'Copy a file to the other machine', command: 'scp FILE USER@HOST:FOLDER' }
    ],
    placeholders: {
      USER: 'Your user name on the other machine',
      HOST: 'Its name or address',
      PORT: 'The SSH port',
      KEYFILE: 'The private key, for example id_ed25519',
      FILE: 'The local file to send',
      FOLDER: 'The folder on the other machine'
    },
    keywords: [
      'ssh',
      'remote login',
      'connect to server',
      'scp',
      'copy file to server',
      'remote shell',
      'vps',
      'putty',
      'permission denied publickey'
    ]
  },
  {
    id: 'sh-ssh-keygen',
    shell: 'bash',
    category: 'network',
    task: 'Make an SSH key (for GitHub or a server)',
    summary:
      'Creates a key pair in ~/.ssh and asks where to save it and for an optional passphrase. The .pub half is the one you paste into GitHub; the other half never leaves this machine.',
    command: 'ssh-keygen -t ed25519 -C "EMAIL"',
    variants: [
      { label: 'Print the public key, ready to paste', command: 'cat ~/.ssh/id_ed25519.pub' },
      { label: 'Test the connection to GitHub', command: 'ssh -T git@github.com' }
    ],
    placeholders: { EMAIL: 'A label for the key, usually your email address' },
    keywords: [
      'ssh key',
      'ssh-keygen',
      'github ssh',
      'public key',
      'id_ed25519',
      'id_rsa',
      'permission denied publickey',
      'deploy key',
      'generate key'
    ],
    danger:
      'If it asks "Overwrite (y/n)?", a key is already there: answering y destroys it, and everything that trusted it stops working.'
  },

  // ----------------------------------------------------------------- system
  {
    id: 'sh-disk-free',
    shell: 'bash',
    category: 'system',
    task: 'See how much disk space is free',
    summary: 'One line per disk with its size, what is used and what is left, in K, M and G.',
    command: 'df -h',
    variants: [{ label: 'Just the Windows C: drive, from WSL', command: 'df -h /mnt/c' }],
    keywords: [
      'df',
      'df -h',
      'disk space',
      'free space',
      'drive full',
      'no space left on device',
      'get-psdrive',
      'storage',
      'how much space left'
    ]
  },
  {
    id: 'sh-memory',
    shell: 'bash',
    category: 'system',
    task: 'See how much memory is in use',
    summary:
      'The "available" column is the one that matters: it is what programs can still have. Under WSL the total is what Windows lends to Linux, not the whole machine.',
    command: 'free -h',
    keywords: [
      'free',
      'memory',
      'ram',
      'how much ram',
      'out of memory',
      'swap',
      'memory usage',
      'killed',
      'wsl memory'
    ]
  },
  {
    id: 'sh-env-show',
    shell: 'bash',
    category: 'system',
    task: 'See my environment variables',
    summary:
      'printenv lists them all. A single value is read with a dollar sign in front of its name.',
    command: 'printenv',
    variants: [
      { label: 'The value of one', command: 'echo "$NAME"' },
      { label: 'The ones whose name or value mentions a word', command: 'printenv | grep -i TEXT' }
    ],
    placeholders: {
      NAME: 'The variable, for example HOME',
      TEXT: 'Part of the name, for example api'
    },
    keywords: [
      'environment variables',
      'env',
      'printenv',
      'set',
      'show variable',
      '$env:',
      'is my api key set',
      'echo variable',
      'dollar sign'
    ]
  },
  {
    id: 'sh-env-set',
    shell: 'bash',
    category: 'system',
    task: 'Set an environment variable',
    summary:
      'export sets it for this shell and everything started from it, until the window closes. No spaces around the =. The ~/.bashrc variant makes it permanent for new shells.',
    command: 'export NAME="VALUE"',
    variants: [
      { label: 'For one command only', command: 'NAME="VALUE" COMMAND' },
      {
        label: 'For good: add the line to ~/.bashrc',
        command: 'echo \'export NAME="VALUE"\' >> ~/.bashrc'
      },
      { label: 'Then load it into this shell', command: 'source ~/.bashrc' }
    ],
    placeholders: {
      NAME: 'The variable name, for example ANTHROPIC_API_KEY',
      VALUE: 'Its value',
      COMMAND: 'The command that should see it'
    },
    keywords: [
      'export',
      'set environment variable',
      'env var',
      'api key',
      'setx',
      '$env:',
      'permanent variable',
      'bashrc',
      'variable gone after restart',
      'command not found after ='
    ]
  },
  {
    id: 'sh-add-to-path',
    shell: 'bash',
    category: 'system',
    task: 'Add a folder to PATH',
    summary:
      'PATH is the list of folders searched for commands, separated by colons. This adds one for the current shell; the variant saves it for every new one. Keep the $PATH part, or every other command disappears.',
    command: 'export PATH="$PATH:FOLDER"',
    variants: [
      {
        label: 'For good: add the line to ~/.bashrc',
        command: 'echo \'export PATH="$PATH:FOLDER"\' >> ~/.bashrc'
      },
      {
        label: 'See what is on PATH now, one folder per line',
        command: "echo \"$PATH\" | tr ':' '\\n'"
      }
    ],
    placeholders: { FOLDER: 'The folder that holds the program, for example $HOME/.local/bin' },
    keywords: [
      'path',
      'add to path',
      'export path',
      'command not found',
      'not on path',
      '.local/bin',
      'edit path',
      '$env:path',
      'bashrc',
      'installed but not found'
    ]
  },
  {
    id: 'sh-which',
    shell: 'bash',
    category: 'system',
    task: 'Find where a program is installed',
    summary:
      'Prints the full path of what would run if you typed that name. No output means it is not on PATH. type also knows about aliases and built-ins.',
    command: 'which NAME',
    variants: [
      { label: 'Aliases and shell built-ins too', command: 'type NAME' },
      { label: 'Every match on PATH, in order', command: 'which -a NAME' }
    ],
    placeholders: { NAME: 'The command, for example node or python3' },
    keywords: [
      'which',
      'where',
      'type',
      'command -v',
      'get-command',
      'find program',
      'is it installed',
      'which version runs',
      'path of executable'
    ]
  },
  {
    id: 'sh-versions',
    shell: 'bash',
    category: 'system',
    task: 'See which Linux version this is',
    summary:
      'Names the distribution and its release, which is what an install guide means by "Ubuntu 24.04".',
    command: 'lsb_release -a',
    variants: [
      { label: 'The same from a file every distribution has', command: 'cat /etc/os-release' },
      { label: 'The kernel (it mentions WSL2 when you are in WSL)', command: 'uname -a' },
      { label: 'Which user I am', command: 'whoami' }
    ],
    keywords: [
      'linux version',
      'ubuntu version',
      'lsb_release',
      'uname',
      'os-release',
      'which distro',
      'am i in wsl',
      'whoami',
      'ver',
      'systeminfo'
    ]
  },
  {
    id: 'sh-sudo',
    shell: 'bash',
    category: 'system',
    task: 'Run a command as administrator',
    summary:
      'sudo runs ONE command as root and asks for YOUR Linux password (the one chosen when Ubuntu was set up). Nothing appears while you type it; that is normal.',
    command: 'sudo COMMAND',
    variants: [{ label: 'Run the previous command again, with sudo', command: 'sudo !!' }],
    placeholders: { COMMAND: 'The command that was refused' },
    keywords: [
      'sudo',
      'run as admin',
      'administrator',
      'root',
      'permission denied',
      'access denied',
      'are you root',
      'password not showing',
      'elevated',
      'runas'
    ],
    danger:
      'Root can change or delete anything in Linux. Only put sudo in front of a command you understand.'
  },

  // --------------------------------------------------------------- packages
  {
    id: 'sh-apt-install',
    shell: 'bash',
    category: 'packages',
    task: 'Install a program or package on Ubuntu',
    summary:
      'apt update refreshes the list of what exists (a fresh WSL has none, so installs fail without it), then install fetches the program.',
    command: 'sudo apt update && sudo apt install -y NAME',
    placeholders: { NAME: 'The package, for example unzip or build-essential' },
    keywords: [
      'apt',
      'apt install',
      'apt-get',
      'install program',
      'install a package',
      'winget',
      'command not found',
      'unable to locate package',
      'package manager',
      'choco'
    ]
  },
  {
    id: 'sh-apt-upgrade',
    shell: 'bash',
    category: 'packages',
    task: 'Update everything installed on Ubuntu',
    summary:
      'Refreshes the package list, then upgrades what has a newer version. It shows the list and asks before going ahead.',
    command: 'sudo apt update && sudo apt upgrade',
    variants: [
      {
        label: 'Afterwards: clear out packages nothing needs any more',
        command: 'sudo apt autoremove'
      }
    ],
    keywords: [
      'apt upgrade',
      'apt update',
      'update ubuntu',
      'update packages',
      'security updates',
      'winget upgrade',
      'upgrade all',
      'system update'
    ]
  },
  {
    id: 'sh-apt-search',
    shell: 'bash',
    category: 'packages',
    task: 'Find a package, or check whether one is installed',
    summary: 'Searches the names and descriptions of everything apt can install.',
    command: 'apt search TEXT',
    variants: [
      {
        label: 'Is it installed, and which version',
        command: 'apt list --installed 2>/dev/null | grep -i NAME'
      },
      { label: 'What a package is, before installing it', command: 'apt show NAME' }
    ],
    placeholders: { TEXT: 'A word describing what you need', NAME: 'The package name' },
    keywords: [
      'apt search',
      'find package',
      'is it installed',
      'apt list',
      'apt show',
      'dpkg -l',
      'winget search',
      'package name',
      'installed version'
    ]
  },
  {
    id: 'sh-apt-remove',
    shell: 'bash',
    category: 'packages',
    task: 'Uninstall a program on Ubuntu',
    summary:
      'Removes the program and keeps its settings, in case it comes back. It lists what will go and asks first.',
    command: 'sudo apt remove NAME',
    variants: [{ label: 'Its system-wide settings too', command: 'sudo apt purge NAME' }],
    placeholders: { NAME: 'The package to remove' },
    keywords: [
      'apt remove',
      'uninstall',
      'remove package',
      'apt purge',
      'winget uninstall',
      'delete program',
      'get rid of package'
    ],
    danger:
      'The program is uninstalled, and purge deletes its configuration as well. Read the list apt shows before answering y.'
  },

  // ------------------------------------------------------------------ shell
  {
    id: 'sh-clear',
    shell: 'bash',
    category: 'shell',
    task: 'Clear the screen',
    summary:
      'Wipes what is on screen; Ctrl+L does the same from the keyboard. Neither touches your files or history.',
    command: 'clear',
    variants: [
      { label: 'The terminal is printing garbage: reset it completely', command: 'reset' }
    ],
    keywords: [
      'clear',
      'cls',
      'clear screen',
      'clear-host',
      'ctrl l',
      'wipe terminal',
      'too much text',
      'garbled terminal',
      'reset'
    ]
  },
  {
    id: 'sh-history',
    shell: 'bash',
    category: 'shell',
    task: 'See or search the commands I have typed',
    summary:
      'Lists your commands, numbered, across sessions. Ctrl+R is the keyboard way: press it, type a few letters, and it finds the last command containing them (Ctrl+R again for older, Enter to run).',
    command: 'history',
    variants: [
      { label: 'Only the ones mentioning a word', command: 'history | grep -i TEXT' },
      { label: 'The last twenty', command: 'history | tail -n 20' },
      { label: 'Run number N from the list again', command: '!N' }
    ],
    placeholders: {
      TEXT: 'Part of the command you are looking for',
      N: 'The number shown beside the command'
    },
    keywords: [
      'history',
      'previous commands',
      'what did i type',
      'ctrl r',
      'reverse search',
      'get-history',
      'doskey /history',
      'recall command',
      'up arrow',
      'bash_history'
    ]
  },
  {
    id: 'sh-help',
    shell: 'bash',
    category: 'shell',
    task: 'Get help on a command',
    summary:
      'man opens the full manual (arrows to scroll, / to search, Q to leave). --help is the short version, and works for nearly everything.',
    command: 'man COMMAND',
    variants: [
      { label: 'The short version', command: 'COMMAND --help' },
      { label: 'For what is built into bash (cd, export, alias)', command: 'help COMMAND' },
      { label: 'Find commands by what they do', command: 'man -k TEXT' }
    ],
    placeholders: {
      COMMAND: 'The command to read about, for example tar',
      TEXT: 'A word such as compress'
    },
    keywords: [
      'man',
      'help',
      '--help',
      'manual',
      'get-help',
      '/?',
      'what does this command do',
      'options',
      'flags',
      'usage',
      'how do i exit man'
    ]
  },
  {
    id: 'sh-bashrc',
    shell: 'bash',
    category: 'shell',
    task: 'Change what runs every time a shell opens',
    summary:
      '~/.bashrc is read by every new bash window: aliases, exports and PATH additions go at its end. After editing, source it to apply the change to the window you are in.',
    command: 'nano ~/.bashrc',
    variants: [{ label: 'Apply the changes to this shell now', command: 'source ~/.bashrc' }],
    keywords: [
      'bashrc',
      '.bashrc',
      'profile',
      '$profile',
      'startup script',
      'shell config',
      'source',
      'reload shell',
      'bash_profile',
      'settings file',
      'autoexec'
    ]
  },
  {
    id: 'sh-alias',
    shell: 'bash',
    category: 'shell',
    task: 'Make a short name for a long command',
    summary:
      'Lasts until this shell closes; the second variant saves it for every new one. No spaces around the =.',
    command: "alias SHORT='COMMAND'",
    variants: [
      { label: 'List the aliases that exist', command: 'alias' },
      {
        label: 'For good: add the line to ~/.bashrc',
        command: 'echo "alias SHORT=\'COMMAND\'" >> ~/.bashrc'
      },
      { label: 'Remove one', command: 'unalias SHORT' }
    ],
    placeholders: {
      SHORT: 'The name to type, for example gs',
      COMMAND: 'What it should run, for example git status'
    },
    keywords: [
      'alias',
      'shortcut command',
      'set-alias',
      'doskey',
      'abbreviation',
      'custom command',
      'nickname',
      'unalias',
      'll'
    ]
  },
  {
    id: 'sh-redirect',
    shell: 'bash',
    category: 'shell',
    task: 'Save the output of a command to a file',
    summary:
      'A single > writes a fresh file each time; a double >> adds to the end of what is there.',
    command: 'COMMAND > FILE',
    variants: [
      { label: 'Add to the end of the file instead', command: 'COMMAND >> FILE' },
      { label: 'Error messages too', command: 'COMMAND > FILE 2>&1' },
      { label: 'Throw the error messages away', command: 'COMMAND 2>/dev/null' },
      { label: 'See it on screen AND save it', command: 'COMMAND | tee FILE' }
    ],
    placeholders: { COMMAND: 'Any command', FILE: 'The file to write, for example output.txt' },
    keywords: [
      'redirect',
      'redirection',
      'save output',
      'write to file',
      'log to file',
      'out-file',
      'append',
      'stderr',
      '2>&1',
      '/dev/null',
      'tee',
      'hide errors'
    ],
    danger:
      'A single > (and tee) replaces everything the file held before. Use >> (or tee -a) to keep it.'
  },
  {
    id: 'sh-pipe',
    shell: 'bash',
    category: 'shell',
    task: 'Send the output of one command into another',
    summary:
      'The bar hands what the first command prints to the second. less pages it (Q to leave); clip.exe puts it on the Windows clipboard.',
    command: 'COMMAND | less',
    variants: [
      {
        label: 'Copy the output to the Windows clipboard (WSL and Git Bash)',
        command: 'COMMAND | clip.exe'
      },
      {
        label: 'Use each line of output as an argument to another command',
        command: 'COMMAND | xargs OTHER'
      }
    ],
    placeholders: {
      COMMAND: 'Any command',
      OTHER: 'The command that should receive the lines, for example ls -l'
    },
    keywords: [
      'pipe',
      'pipeline',
      'vertical bar',
      'less',
      'more',
      'page output',
      'clip',
      'copy output to clipboard',
      'pbcopy',
      'xclip',
      'set-clipboard',
      'xargs'
    ]
  },
  {
    id: 'sh-several-commands',
    shell: 'bash',
    category: 'shell',
    task: 'Run several commands on one line',
    summary:
      '&& runs the second command only if the first one worked, which is nearly always what you want.',
    command: 'FIRST && SECOND',
    variants: [
      { label: 'Run the second whatever happens', command: 'FIRST ; SECOND' },
      { label: 'Run the second only if the first FAILED', command: 'FIRST || SECOND' }
    ],
    placeholders: { FIRST: 'The first command', SECOND: 'The command to run after it' },
    keywords: [
      'chain commands',
      'multiple commands',
      'one line',
      'and and',
      'semicolon',
      'run after',
      'if it fails',
      'then run',
      'ampersand'
    ]
  },
  {
    id: 'sh-exit',
    shell: 'bash',
    category: 'shell',
    task: 'Leave the shell, or an SSH session',
    summary:
      'Closes the shell you are in: out of an SSH login back to your own machine, or out of WSL back to Windows. Ctrl+D on an empty line does the same.',
    command: 'exit',
    keywords: [
      'exit',
      'quit',
      'logout',
      'log out',
      'close terminal',
      'leave ssh',
      'ctrl d',
      'disconnect',
      'leave wsl',
      'end session'
    ]
  }
]
