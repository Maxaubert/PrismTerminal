/**
 * THE HELP CATALOGUE, Command Prompt (#12).
 *
 * The everyday only: moving around, files and folders, finding text, what is
 * running and on which port, the network basics, environment variables and the
 * prompt's own grammar (redirection, pipes, chaining). Command Prompt is the
 * shell a beginner meets in old tutorials, so the keywords lean on what the
 * same thing is called in bash and PowerShell ("ls", "grep", "which").
 *
 * HOW THESE WERE CHECKED (2026-09-20, stock cmd.exe on Windows 11 26200): every
 * read-only command, and every file command inside a scratch folder made for
 * the purpose, was RUN and its output read. taskkill was run against a ping
 * this check had started itself. Three things were found that way and shaped
 * the entries: 'fsutil volume diskfree' answers "Access is denied" without
 * elevation, so free space is read off 'dir'; 'type nul > NAME' EMPTIES a file
 * that already exists, so the entry appends instead; and robocopy's exit code 1
 * means "copied", not "failed". Not run, on purpose: setx (it writes the
 * registry), the elevation prompt, the Environment Variables dialog, 'start'
 * and 'clip' (they open windows or replace the clipboard).
 */

import type { HelpEntry } from './types'

export const CMD_HELP: readonly HelpEntry[] = [
  // ---------------------------------------------------------------- folders
  {
    id: 'cmd-where-am-i',
    shell: 'cmd',
    category: 'folders',
    task: 'See which folder I am in',
    summary:
      'cd on its own prints the current folder rather than changing it, which is the same thing the prompt shows before the >.',
    command: 'cd',
    variants: [
      { label: 'The same, as a variable you can use in another command', command: 'echo %cd%' }
    ],
    keywords: [
      'where am i',
      'current folder',
      'current directory',
      'working directory',
      'pwd',
      'get-location',
      'path of this folder',
      'which folder'
    ]
  },
  {
    id: 'cmd-change-folder',
    shell: 'cmd',
    category: 'folders',
    task: 'Go to another folder',
    summary:
      'Moves the prompt into a folder. Add /d whenever the folder may be on another drive: without it cd will not leave the drive you are on, and appears to do nothing.',
    command: 'cd /d FOLDER',
    variants: [
      { label: 'A folder inside this one', command: 'cd NAME' },
      { label: 'Your own user folder', command: 'cd /d "%USERPROFILE%"' },
      { label: 'Switch drive only', command: 'D:' }
    ],
    placeholders: {
      FOLDER: 'The full path, in quotes if it has spaces: "D:\\My Projects\\site"',
      NAME: 'The name of a folder inside the current one'
    },
    keywords: [
      'cd',
      'change directory',
      'change folder',
      'open folder',
      'go to folder',
      'navigate',
      'set-location',
      'switch drive',
      'cd does nothing',
      'home folder'
    ]
  },
  {
    id: 'cmd-go-up',
    shell: 'cmd',
    category: 'folders',
    task: 'Go back up a folder',
    summary: 'Two dots mean "the folder that holds this one", so this steps out one level.',
    command: 'cd ..',
    variants: [
      { label: 'Up two levels', command: 'cd ..\\..' },
      { label: 'All the way to the top of the drive', command: 'cd \\' }
    ],
    keywords: [
      'go back',
      'back a folder',
      'parent folder',
      'up one level',
      'previous folder',
      'cd ..',
      'dot dot',
      'leave folder',
      'root of drive'
    ]
  },
  {
    id: 'cmd-make-folder',
    shell: 'cmd',
    category: 'folders',
    task: 'Make a new folder',
    summary:
      'Creates a folder, and any folders missing on the way to it, in one go. md is the same command.',
    command: 'mkdir NAME',
    variants: [{ label: 'Several levels at once', command: 'mkdir PARENT\\CHILD\\GRANDCHILD' }],
    placeholders: {
      NAME: 'The new folder, in quotes if it has spaces',
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
    id: 'cmd-delete-folder',
    shell: 'cmd',
    category: 'folders',
    task: 'Delete a folder and everything in it',
    summary:
      '/s takes the contents too and /q skips the "are you sure". Without /s, rmdir only removes a folder that is already empty and otherwise says "The directory is not empty".',
    command: 'rmdir /s /q FOLDER',
    variants: [{ label: 'Only if it is empty (the safe form)', command: 'rmdir FOLDER' }],
    placeholders: { FOLDER: 'The folder to remove' },
    keywords: [
      'rmdir',
      'rd',
      'remove folder',
      'delete directory',
      'rm -rf',
      'remove-item',
      'the directory is not empty',
      'delete node_modules',
      'wipe folder'
    ],
    danger:
      'The folder and everything inside it is deleted at once and does NOT go to the Recycle Bin. There is no undo.'
  },
  {
    id: 'cmd-tree',
    shell: 'cmd',
    category: 'folders',
    task: 'Show the folder structure as a tree',
    summary: 'Draws the folders under this one as a tree. /f lists the files as well.',
    command: 'tree /f',
    variants: [
      { label: 'Folders only', command: 'tree' },
      { label: 'Save it as plain text you can paste anywhere', command: 'tree /f /a > tree.txt' }
    ],
    danger:
      'The variant that saves to tree.txt replaces a file of that name if one is already there.',
    keywords: [
      'tree',
      'folder structure',
      'directory structure',
      'project layout',
      'show hierarchy',
      'list subfolders',
      'outline of folders'
    ]
  },
  {
    id: 'cmd-folder-size',
    shell: 'cmd',
    category: 'folders',
    task: 'See how big a folder is',
    summary:
      'Lists everything under the folder, hidden files included. The answer is at the very END of the output: "Total Files Listed", with the file count and the bytes.',
    command: 'dir /s /a FOLDER',
    placeholders: { FOLDER: 'The folder to measure, or . for the current one' },
    keywords: [
      'folder size',
      'directory size',
      'how big',
      'disk usage',
      'du -sh',
      'space used',
      'total size',
      'how much space'
    ]
  },
  {
    id: 'cmd-biggest-files',
    shell: 'cmd',
    category: 'files',
    task: 'Find the biggest files in a folder',
    summary:
      'Walks this folder and everything under it and prints each file over a size you choose, in bytes, with its full path. 104857600 is 100 MB. It reads every file entry, so a big drive takes a while.',
    command: 'forfiles /s /c "cmd /c if @isdir==FALSE if @fsize GEQ BYTES echo @fsize @path"',
    variants: [
      { label: 'Just this folder, biggest first', command: 'dir /o-s /a-d' },
      { label: 'Everything over 1 GB', command: 'forfiles /s /c "cmd /c if @isdir==FALSE if @fsize GEQ 1073741824 echo @fsize @path"' }
    ],
    placeholders: { BYTES: 'The smallest size to report, in bytes: 104857600 is 100 MB' },
    keywords: [
      'big files',
      'largest files',
      'large files',
      'what is taking up space',
      'disk full',
      'free up space',
      'huge files',
      'du',
      'sort by size',
      'file size'
    ]
  },
  {
    id: 'cmd-unzip',
    shell: 'cmd',
    category: 'files',
    task: 'Unzip a file, or make a zip',
    summary:
      'Windows 10 and 11 ship tar, which reads and writes zip files as well as tar ones. Extracting puts the contents in the current folder and writes over files of the same name.',
    command: 'tar -xf ARCHIVE.zip',
    variants: [
      { label: 'Into another folder, which must already exist', command: 'tar -xf ARCHIVE.zip -C FOLDER' },
      { label: 'See what is inside without extracting', command: 'tar -tf ARCHIVE.zip' },
      { label: 'Make a zip of a folder', command: 'tar -a -c -f ARCHIVE.zip FOLDER' }
    ],
    placeholders: {
      ARCHIVE: 'The zip file name without its .zip ending',
      FOLDER: 'The folder to extract into, or to pack'
    },
    keywords: [
      'unzip',
      'zip',
      'extract',
      'extract archive',
      'expand-archive',
      'compress',
      'compressed folder',
      'tar',
      'open zip',
      'unpack'
    ],
    danger: 'Extracting replaces files of the same name in the folder it extracts into, without asking.'
  },
  {
    id: 'cmd-open-explorer',
    shell: 'cmd',
    category: 'folders',
    task: 'Open this folder in File Explorer',
    summary:
      'The dot means "here", so this opens an Explorer window on the folder the prompt is in.',
    command: 'start .',
    variants: [
      { label: 'The same, by another name', command: 'explorer .' },
      { label: 'Some other folder', command: 'start "" "FOLDER"' }
    ],
    placeholders: { FOLDER: 'The folder to open' },
    keywords: [
      'explorer',
      'file explorer',
      'open folder',
      'open in explorer',
      'show in explorer',
      'windows explorer',
      'invoke-item',
      'ii .',
      'open here'
    ]
  },

  // ------------------------------------------------------------------ files
  {
    id: 'cmd-list-files',
    shell: 'cmd',
    category: 'files',
    task: 'List the files in this folder',
    summary:
      'Shows what is in the current folder, with sizes and dates. Give it a folder to list that one instead.',
    command: 'dir',
    variants: [
      { label: 'Names only, one per line', command: 'dir /b' },
      { label: 'Newest first', command: 'dir /o-d' },
      { label: 'Biggest first', command: 'dir /o-s' },
      { label: 'Only one type of file', command: 'dir *.EXT' }
    ],
    placeholders: { EXT: 'The file extension, for example txt' },
    keywords: [
      'dir',
      'ls',
      'list files',
      'show files',
      'see files',
      'files here',
      'what files are here',
      'whats in this folder',
      'what is in this folder',
      'list everything',
      'directory listing',
      'sort by date',
      'sort by size',
      'newest files'
    ]
  },
  {
    id: 'cmd-hidden-files',
    shell: 'cmd',
    category: 'files',
    task: 'See hidden files too',
    summary:
      'Plain dir leaves hidden and system files out. /a lists everything, which is how you find .git, .env and the like when Windows has marked them hidden.',
    command: 'dir /a',
    variants: [
      { label: 'ONLY the hidden ones', command: 'dir /ah' },
      { label: 'Show each file with its hidden (H) and read-only (R) marks', command: 'attrib' }
    ],
    keywords: [
      'hidden files',
      'show hidden',
      'ls -a',
      'dotfiles',
      'system files',
      'file missing from dir',
      'get-childitem -force',
      'attrib',
      'invisible files'
    ]
  },
  {
    id: 'cmd-find-file-by-name',
    shell: 'cmd',
    category: 'files',
    task: 'Find a file by name, in this folder and below',
    summary:
      '/s searches every subfolder and /b prints just the full path of each match. The stars mean "anything", so part of the name is enough.',
    command: 'dir /s /b *NAME*',
    variants: [{ label: 'Hidden files as well', command: 'dir /s /b /a *NAME*' }],
    placeholders: { NAME: 'Any part of the file name' },
    keywords: [
      'find file',
      'search for file',
      'locate file',
      'where is my file',
      'find by name',
      'recursive search',
      'find .',
      'get-childitem -recurse',
      'wildcard'
    ]
  },
  {
    id: 'cmd-read-file',
    shell: 'cmd',
    category: 'files',
    task: 'Read a text file in the terminal',
    summary:
      'Prints the whole file. For a long one use more, which shows a screen at a time: Space for the next, Q to stop.',
    command: 'type FILE',
    variants: [{ label: 'A screen at a time', command: 'more FILE' }],
    placeholders: { FILE: 'The file to read' },
    keywords: [
      'type',
      'cat',
      'read file',
      'show file',
      'print file',
      'view contents',
      'get-content',
      'open text file',
      'more',
      'less'
    ]
  },
  {
    id: 'cmd-make-file',
    shell: 'cmd',
    category: 'files',
    task: 'Make a new empty file',
    summary:
      'Creates the file if it is missing and leaves it untouched if it is already there (the double >> appends nothing, where a single > would empty it).',
    command: 'type nul >> NAME',
    variants: [
      {
        label: 'A file with one line of text in it (REPLACES the file if it exists)',
        command: 'echo TEXT> NAME'
      }
    ],
    placeholders: {
      NAME: 'The file to create, for example notes.txt',
      TEXT: 'The first line of the file'
    },
    danger:
      'The echo variant replaces everything in the file if it already exists. The main command never does.',
    keywords: [
      'touch',
      'create file',
      'new file',
      'make file',
      'empty file',
      'new-item',
      'blank file',
      'create .env'
    ]
  },
  {
    id: 'cmd-copy-file',
    shell: 'cmd',
    category: 'files',
    task: 'Copy a file',
    summary:
      'Copies one file to a new name or into a folder. Typed at the prompt it asks before replacing a file of the same name; add /y to stop it asking.',
    command: 'copy SOURCE DESTINATION',
    placeholders: {
      SOURCE: 'The file to copy',
      DESTINATION: 'A folder to copy it into, or the new file name'
    },
    keywords: [
      'copy',
      'cp',
      'duplicate file',
      'copy-item',
      'make a copy',
      'back up a file',
      'copy to folder'
    ]
  },
  {
    id: 'cmd-copy-folder',
    shell: 'cmd',
    category: 'files',
    task: 'Copy a whole folder',
    summary:
      'copy does not do folders; robocopy does. /e brings every subfolder, empty ones included. It prints a summary table, and an exit code of 1 means "files were copied", not an error.',
    command: 'robocopy SOURCE DESTINATION /e',
    variants: [{ label: 'The older tool, same job', command: 'xcopy SOURCE DESTINATION /e /i' }],
    placeholders: {
      SOURCE: 'The folder to copy',
      DESTINATION: 'Where the copy goes (it is created if missing)'
    },
    keywords: [
      'robocopy',
      'xcopy',
      'copy folder',
      'copy directory',
      'cp -r',
      'copy recursive',
      'back up folder',
      'copy-item -recurse',
      'duplicate folder'
    ],
    danger:
      'Files already in the destination with the same name are replaced by the source version without asking.'
  },
  {
    id: 'cmd-move-file',
    shell: 'cmd',
    category: 'files',
    task: 'Move a file or folder somewhere else',
    summary:
      'Moves it rather than copying. Typed at the prompt it asks before replacing a file of the same name.',
    command: 'move SOURCE DESTINATION',
    placeholders: {
      SOURCE: 'The file or folder to move',
      DESTINATION: 'The folder it should end up in'
    },
    keywords: [
      'move',
      'mv',
      'move-item',
      'relocate',
      'put file in folder',
      'cut and paste',
      'move folder'
    ]
  },
  {
    id: 'cmd-rename',
    shell: 'cmd',
    category: 'files',
    task: 'Rename a file or folder',
    summary: 'The new name is a name only, not a path: ren renames in place and never moves.',
    command: 'ren OLDNAME NEWNAME',
    variants: [
      { label: 'Change the extension of many files at once', command: 'ren *.OLDEXT *.NEWEXT' }
    ],
    placeholders: {
      OLDNAME: 'The file or folder as it is now',
      NEWNAME: 'The new name, without a folder in front',
      OLDEXT: 'The extension they have, for example txt',
      NEWEXT: 'The extension they should get, for example md'
    },
    keywords: [
      'ren',
      'rename',
      'rename-item',
      'mv',
      'change file name',
      'change extension',
      'bulk rename'
    ]
  },
  {
    id: 'cmd-delete-file',
    shell: 'cmd',
    category: 'files',
    task: 'Delete a file',
    summary:
      'Removes the file. A wildcard removes every match, so list them with dir first when you use one.',
    command: 'del FILE',
    variants: [
      { label: 'Every file of one type here, without asking', command: 'del /q *.EXT' },
      { label: 'That type in every subfolder too', command: 'del /s /q *.EXT' }
    ],
    placeholders: { FILE: 'The file to delete', EXT: 'The file extension, for example tmp' },
    keywords: [
      'del',
      'erase',
      'rm',
      'delete file',
      'remove file',
      'remove-item',
      'get rid of file',
      'delete all tmp'
    ],
    danger: 'Deleted files do NOT go to the Recycle Bin. They are gone.'
  },
  {
    id: 'cmd-open-file',
    shell: 'cmd',
    category: 'files',
    task: 'Open a file in its usual program',
    summary:
      'Does what a double-click does. The empty "" is not a mistake: start takes its first quoted word as a window title, so without it a quoted path opens nothing.',
    command: 'start "" "FILE"',
    variants: [{ label: 'Open a web page in the browser', command: 'start "" "https://URL"' }],
    placeholders: { FILE: 'The file to open', URL: 'The address, without the https:// in front' },
    keywords: [
      'open file',
      'start',
      'double click',
      'default program',
      'launch',
      'invoke-item',
      'open in browser',
      'open url',
      'xdg-open'
    ]
  },

  // ------------------------------------------------------------------- text
  {
    id: 'cmd-find-text-in-files',
    shell: 'cmd',
    category: 'text',
    task: 'Find text inside files',
    summary:
      'Searches every file here and in every subfolder. /i ignores upper and lower case, /n shows the line number, and /c: keeps a phrase with spaces together.',
    command: 'findstr /s /i /n /c:"TEXT" *.*',
    variants: [
      {
        label: 'Just the names of the files that contain it',
        command: 'findstr /s /i /m /c:"TEXT" *.*'
      },
      { label: 'Only in one type of file', command: 'findstr /s /i /n /c:"TEXT" *.EXT' },
      { label: 'In a single file', command: 'findstr /i /n /c:"TEXT" FILE' }
    ],
    placeholders: {
      TEXT: 'The words to look for',
      EXT: 'The file extension, for example js',
      FILE: 'The file to search'
    },
    keywords: [
      'findstr',
      'grep',
      'grep -r',
      'search in files',
      'find text',
      'find string',
      'select-string',
      'search code',
      'which file contains',
      'find word'
    ]
  },
  {
    id: 'cmd-filter-output',
    shell: 'cmd',
    category: 'text',
    task: 'Show only the lines of output that mention something',
    summary: 'Pipes a command into findstr so a long list is cut down to the lines you care about.',
    command: 'COMMAND | findstr /i "TEXT"',
    variants: [
      { label: 'The lines that do NOT mention it', command: 'COMMAND | findstr /i /v "TEXT"' }
    ],
    placeholders: {
      COMMAND: 'Any command that prints a lot, for example tasklist',
      TEXT: 'The word to keep'
    },
    keywords: [
      'filter output',
      'grep',
      'pipe to findstr',
      'search output',
      'where-object',
      'narrow down',
      'only matching lines',
      'too much output'
    ]
  },
  {
    id: 'cmd-compare-files',
    shell: 'cmd',
    category: 'text',
    task: 'Compare two files',
    summary:
      'Prints the lines that differ, or "no differences encountered" when the two are the same.',
    command: 'fc FILE1 FILE2',
    variants: [
      { label: 'Byte by byte, for files that are not text', command: 'fc /b FILE1 FILE2' }
    ],
    placeholders: { FILE1: 'The first file', FILE2: 'The second file' },
    keywords: [
      'fc',
      'diff',
      'compare files',
      'compare-object',
      'what changed',
      'are these files the same',
      'differences'
    ]
  },

  // -------------------------------------------------------------- processes
  {
    id: 'cmd-list-processes',
    shell: 'cmd',
    category: 'processes',
    task: 'See what is running',
    summary:
      'Lists every running program with its PID (the number you need to stop it) and its memory use.',
    command: 'tasklist',
    variants: [
      { label: 'Only one program', command: 'tasklist /fi "imagename eq NAME.exe"' },
      { label: 'Anything whose name contains a word', command: 'tasklist | findstr /i "NAME"' }
    ],
    placeholders: { NAME: 'The program, for example node' },
    keywords: [
      'tasklist',
      'ps',
      'ps aux',
      'running programs',
      'processes',
      'get-process',
      'task manager',
      'is node running',
      'pid'
    ]
  },
  {
    id: 'cmd-kill-process',
    shell: 'cmd',
    category: 'processes',
    task: 'Force a program to stop',
    summary:
      '/f forces it and /im picks it by name, which stops EVERY copy of that program. Use the PID form to stop just one.',
    command: 'taskkill /im NAME.exe /f',
    variants: [
      { label: 'Just one, by its PID', command: 'taskkill /pid PID /f' },
      { label: 'It and everything it started', command: 'taskkill /pid PID /t /f' }
    ],
    placeholders: {
      NAME: 'The program, for example node',
      PID: 'The number from tasklist or netstat'
    },
    keywords: [
      'taskkill',
      'kill',
      'kill process',
      'stop program',
      'end task',
      'stop-process',
      'frozen',
      'not responding',
      'kill node',
      'pkill'
    ],
    danger:
      'The program is stopped at once, without the chance to save. Unsaved work in it is lost.'
  },
  {
    id: 'cmd-port-in-use',
    shell: 'cmd',
    category: 'processes',
    task: 'Find what is using a port',
    summary:
      'The LAST column of the matching line is the PID of the program holding the port. It also matches longer numbers that start the same (3000 finds 30001), so read the line.',
    command: 'netstat -ano | findstr :PORT',
    variants: [
      { label: 'Then: which program has that PID', command: 'tasklist /fi "pid eq PID"' },
      { label: 'Every port something is listening on', command: 'netstat -ano | findstr LISTENING' }
    ],
    placeholders: {
      PORT: 'The port number, for example 3000',
      PID: 'The number from the last column'
    },
    keywords: [
      'port in use',
      'port already in use',
      'eaddrinuse',
      'address already in use',
      'what is using port 3000',
      'netstat',
      'lsof -i',
      'listening ports',
      'get-nettcpconnection',
      'free a port'
    ]
  },
  {
    id: 'cmd-cancel-command',
    shell: 'cmd',
    category: 'processes',
    task: 'Stop a command that is still running',
    summary:
      'Not a command but a key: hold Ctrl and press C in the terminal. A batch file then asks "Terminate batch job (Y/N)?", to which the answer is Y. With text selected, Ctrl+C copies instead, so click once to clear the selection first.',
    command: 'Ctrl+C',
    variants: [
      {
        label: 'If it ignores the key: stop the program from another window',
        command: 'taskkill /im NAME.exe /f'
      }
    ],
    placeholders: { NAME: 'The program that will not stop, for example node' },
    danger:
      'The taskkill variant stops every copy of that program at once, without the chance to save.',
    keywords: [
      'cancel',
      'stop',
      'abort',
      'interrupt',
      'ctrl c',
      'how do i stop this',
      'stuck',
      'hung',
      'wont stop',
      'terminate batch job',
      'exit running command'
    ]
  },

  // ---------------------------------------------------------------- network
  {
    id: 'cmd-ip-address',
    shell: 'cmd',
    category: 'network',
    task: 'Find my IP address',
    summary:
      "Shows this computer's address on your own network (the IPv4 line), not the one the internet sees.",
    command: 'ipconfig',
    variants: [
      { label: 'Just the address lines', command: 'ipconfig | findstr IPv4' },
      { label: 'Everything: DNS servers, MAC address, DHCP', command: 'ipconfig /all' }
    ],
    keywords: [
      'ipconfig',
      'ip address',
      'my ip',
      'local ip',
      'ifconfig',
      'ip addr',
      'network settings',
      'mac address',
      'gateway',
      'dns server'
    ]
  },
  {
    id: 'cmd-ping',
    shell: 'cmd',
    category: 'network',
    task: 'Check whether a site or machine can be reached',
    summary:
      'Sends four small packets and reports whether they came back and how fast. "Request timed out" means no answer.',
    command: 'ping HOST',
    variants: [
      { label: 'Look the name up in DNS', command: 'nslookup HOST' },
      { label: 'Show each hop on the way there (slow)', command: 'tracert HOST' }
    ],
    placeholders: { HOST: 'A name or an address, for example github.com' },
    keywords: [
      'ping',
      'is the internet working',
      'connection test',
      'test-connection',
      'nslookup',
      'dns lookup',
      'tracert',
      'traceroute',
      'site down',
      'no internet'
    ]
  },
  {
    id: 'cmd-download',
    shell: 'cmd',
    category: 'network',
    task: 'Download a file from a URL',
    summary:
      'curl ships with Windows. -L follows redirects (most download links have one) and -o names the file to save.',
    command: 'curl -L -o FILE URL',
    variants: [
      { label: 'Only check that a site answers (headers, no download)', command: 'curl -I URL' }
    ],
    placeholders: {
      FILE: 'What to call the saved file',
      URL: 'The full address, starting https://'
    },
    danger: 'A file of the same name is replaced without a question.',
    keywords: [
      'curl',
      'download',
      'wget',
      'fetch url',
      'invoke-webrequest',
      'save file from internet',
      'http request',
      'check website'
    ]
  },

  // ----------------------------------------------------------------- system
  {
    id: 'cmd-env-show',
    shell: 'cmd',
    category: 'system',
    task: 'See my environment variables',
    summary:
      'set on its own lists them all. Followed by a few letters it lists the ones whose names start that way.',
    command: 'set',
    variants: [
      { label: 'The ones starting with some letters', command: 'set NAME' },
      { label: 'The value of one', command: 'echo %NAME%' }
    ],
    placeholders: { NAME: 'The variable, for example PATH or ANTHROPIC' },
    keywords: [
      'environment variables',
      'env',
      'printenv',
      'show variable',
      'set',
      '$env:',
      'is my api key set',
      'echo variable',
      'get-childitem env:'
    ]
  },
  {
    id: 'cmd-env-set',
    shell: 'cmd',
    category: 'system',
    task: 'Set an environment variable',
    summary:
      'set lasts for this window only and works at once. setx saves it for good, but only windows opened AFTERWARDS see it: this window does not.',
    command: 'set NAME=VALUE',
    variants: [{ label: 'Permanently, for new windows', command: 'setx NAME "VALUE"' }],
    placeholders: {
      NAME: 'The variable name',
      VALUE: 'Its value; no spaces around the = and no quotes with set'
    },
    keywords: [
      'set environment variable',
      'export',
      'setx',
      'api key',
      'env var',
      '$env:',
      'permanent variable',
      'variable not found after setx',
      'setenvironmentvariable'
    ],
    danger:
      'setx replaces whatever value the variable already had, and cuts a value longer than 1024 characters short.'
  },
  {
    id: 'cmd-add-to-path',
    shell: 'cmd',
    category: 'system',
    task: 'Add a folder to PATH',
    summary:
      'This adds it for the current window only, which is safe. To add it for good, use the Windows dialog in the variant: doing it with setx is a known trap that can cut PATH short.',
    command: 'set PATH=%PATH%;FOLDER',
    variants: [
      {
        label: 'Open the Environment Variables dialog to add it permanently',
        command: 'rundll32 sysdm.cpl,EditEnvironmentVariables'
      },
      { label: 'See what is on PATH now', command: 'path' }
    ],
    placeholders: { FOLDER: 'The folder that holds the program, without quotes' },
    keywords: [
      'path',
      'add to path',
      'is not recognized as an internal or external command',
      'command not found',
      'export path',
      'environment variables dialog',
      'edit path',
      '$env:path'
    ]
  },
  {
    id: 'cmd-where',
    shell: 'cmd',
    category: 'system',
    task: 'Find where a program is installed',
    summary:
      'Prints the full path of what would run if you typed that name, every match on PATH in order. "Could not find files" means it is not on PATH.',
    command: 'where NAME',
    placeholders: { NAME: 'The command, for example node or git' },
    keywords: [
      'where',
      'which',
      'get-command',
      'find program',
      'is it installed',
      'which version runs',
      'path of executable',
      'command location',
      'not recognized'
    ]
  },
  {
    id: 'cmd-system-info',
    shell: 'cmd',
    category: 'system',
    task: 'See my Windows version and machine details',
    summary:
      'A full page on the machine: Windows edition and build, memory, uptime. It takes a few seconds.',
    command: 'systeminfo',
    variants: [
      { label: 'Just the Windows version', command: 'ver' },
      { label: "This computer's name", command: 'hostname' },
      { label: 'Which user I am signed in as', command: 'whoami' }
    ],
    keywords: [
      'systeminfo',
      'windows version',
      'ver',
      'uname',
      'how much ram',
      'memory',
      'computer name',
      'hostname',
      'whoami',
      'get-computerinfo',
      'uptime'
    ]
  },
  {
    id: 'cmd-disk-space',
    shell: 'cmd',
    category: 'system',
    task: 'See how much disk space is free',
    summary:
      'The LAST line of a dir says how many bytes are free on that drive. Change the letter for another drive.',
    command: 'dir C:\\',
    keywords: [
      'disk space',
      'free space',
      'df -h',
      'drive full',
      'how much space left',
      'get-psdrive',
      'get-volume',
      'storage'
    ]
  },
  {
    id: 'cmd-run-as-admin',
    shell: 'cmd',
    category: 'system',
    task: 'Open a Command Prompt as administrator',
    summary:
      'For when a command answers "Access is denied" or "requires elevation". Windows asks for permission, then opens a NEW window with full rights; this one stays as it was.',
    command: 'powershell -Command "Start-Process cmd -Verb RunAs"',
    variants: [
      {
        label: 'Check whether THIS window is already elevated',
        command:
          'whoami /groups | findstr /c:"S-1-16-12288" >nul && echo elevated || echo not elevated'
      }
    ],
    keywords: [
      'run as admin',
      'administrator',
      'elevated',
      'access is denied',
      'access denied',
      'sudo',
      'requires elevation',
      'permission denied',
      'uac',
      'runas'
    ]
  },

  // ------------------------------------------------------------------ shell
  {
    id: 'cmd-clear',
    shell: 'cmd',
    category: 'shell',
    task: 'Clear the screen',
    summary: 'Wipes what is on screen. It does not touch your files or your command history.',
    command: 'cls',
    keywords: [
      'cls',
      'clear',
      'clear screen',
      'clear-host',
      'ctrl l',
      'wipe terminal',
      'clean up screen',
      'too much text'
    ]
  },
  {
    id: 'cmd-history',
    shell: 'cmd',
    category: 'shell',
    task: 'See the commands I have typed',
    summary:
      'Lists what was typed in THIS window. Command Prompt keeps no history between windows. The Up arrow walks back through the same list, and F7 shows it as a menu.',
    command: 'doskey /history',
    variants: [
      { label: 'Save it to a file before closing', command: 'doskey /history > history.txt' }
    ],
    danger:
      'The variant that saves to history.txt replaces a file of that name if one is already there.',
    keywords: [
      'history',
      'doskey',
      'previous commands',
      'what did i type',
      'get-history',
      'command log',
      'f7',
      'up arrow',
      'recall command'
    ]
  },
  {
    id: 'cmd-help',
    shell: 'cmd',
    category: 'shell',
    task: 'Get help on a command',
    summary:
      'Nearly every Command Prompt command explains itself when given /?. help on its own lists the built-in ones.',
    command: 'COMMAND /?',
    variants: [
      { label: 'The list of built-in commands', command: 'help' },
      { label: 'A long help page, a screen at a time', command: 'COMMAND /? | more' }
    ],
    placeholders: { COMMAND: 'The command to read about, for example robocopy' },
    keywords: [
      'help',
      'man',
      '--help',
      'get-help',
      'what does this command do',
      'options',
      'switches',
      'flags',
      'usage',
      'manual'
    ]
  },
  {
    id: 'cmd-echo',
    shell: 'cmd',
    category: 'shell',
    task: 'Print some text or the value of a variable',
    summary:
      'echo repeats what follows it, with any %VARIABLE% filled in. Handy for checking a value before using it.',
    command: 'echo TEXT',
    variants: [
      { label: 'An empty line', command: 'echo.' },
      { label: "Today's date and the time", command: 'echo %DATE% %TIME%' }
    ],
    placeholders: { TEXT: 'What to print' },
    keywords: [
      'echo',
      'print',
      'write-output',
      'write-host',
      'show text',
      'print variable',
      'date',
      'time',
      'blank line'
    ]
  },
  {
    id: 'cmd-redirect',
    shell: 'cmd',
    category: 'shell',
    task: 'Save the output of a command to a file',
    summary:
      'A single > writes a fresh file each time; a double >> adds to the end of what is there.',
    command: 'COMMAND > FILE',
    variants: [
      { label: 'Add to the end of the file instead', command: 'COMMAND >> FILE' },
      { label: 'Error messages too', command: 'COMMAND > FILE 2>&1' },
      { label: 'Throw the error messages away', command: 'COMMAND 2>nul' }
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
      'hide errors',
      '/dev/null'
    ],
    danger: 'A single > replaces everything the file held before. Use >> to keep it.'
  },
  {
    id: 'cmd-pipe',
    shell: 'cmd',
    category: 'shell',
    task: 'Send the output of one command into another',
    summary:
      'The bar hands what the first command prints to the second. more pages it, sort orders it, clip puts it on the clipboard.',
    command: 'COMMAND | more',
    variants: [
      { label: 'Copy the output to the clipboard', command: 'COMMAND | clip' },
      { label: 'Sort the lines', command: 'COMMAND | sort' }
    ],
    placeholders: { COMMAND: 'Any command' },
    keywords: [
      'pipe',
      'pipeline',
      'vertical bar',
      'more',
      'less',
      'page output',
      'clip',
      'copy output to clipboard',
      'set-clipboard',
      'pbcopy',
      'sort output'
    ]
  },
  {
    id: 'cmd-several-commands',
    shell: 'cmd',
    category: 'shell',
    task: 'Run several commands on one line',
    summary:
      '&& runs the second command only if the first one worked, which is nearly always what you want.',
    command: 'FIRST && SECOND',
    variants: [
      { label: 'Run the second whatever happens', command: 'FIRST & SECOND' },
      { label: 'Run the second only if the first FAILED', command: 'FIRST || SECOND' }
    ],
    placeholders: { FIRST: 'The first command', SECOND: 'The command to run after it' },
    keywords: [
      'chain commands',
      'multiple commands',
      'one line',
      'and and',
      'ampersand',
      'semicolon',
      'run after',
      'if it fails',
      'then run'
    ]
  },
  {
    id: 'cmd-alias',
    shell: 'cmd',
    category: 'shell',
    task: 'Make a short name for a long command',
    summary:
      'A doskey macro. $* passes along whatever you type after the short name. It lasts until this window closes.',
    command: 'doskey SHORT=COMMAND $*',
    variants: [{ label: 'List the macros I have made', command: 'doskey /macros' }],
    placeholders: {
      SHORT: 'The name to type, for example ll',
      COMMAND: 'What it should run, for example dir /a'
    },
    keywords: [
      'alias',
      'doskey',
      'macro',
      'shortcut command',
      'set-alias',
      'abbreviation',
      'custom command',
      'nickname'
    ]
  }
]
