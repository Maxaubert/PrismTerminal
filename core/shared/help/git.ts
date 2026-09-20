/**
 * THE HELP PANEL'S CATALOGUE: git (#12).
 *
 * Git is the same text in PowerShell, cmd and bash, so every entry here is
 * shell 'any'. That is a promise, and it shaped the wording: no `&&` (Windows
 * PowerShell 5.1 has no such operator), no `HEAD^` (cmd reads the caret as its
 * escape character, so `HEAD~1` is used throughout), and no `stash@{0}` or
 * `@{u}` (PowerShell reads `@{` as the start of a hashtable).
 *
 * HOW THESE WERE CHECKED (2026-09-20, git 2.55 for Windows): every command
 * and variant below was run in a throwaway repository with a throwaway bare
 * remote and its own GIT_CONFIG_GLOBAL, the destructive ones included, since
 * nothing in that folder mattered. The quoting-sensitive ones (-S "TEXT",
 * --grep="TEXT", main...HEAD, -m "MESSAGE") were run again under PowerShell
 * 7.6 and Windows PowerShell 5.1. `git merge --continue` and `git cherry-pick`
 * were not exercised to completion; they are long-standing git and are listed
 * on that strength.
 *
 * The newer verbs (`switch`, `restore`, git 2.23 and later) lead, because
 * they each do one thing; the `checkout` spelling is kept as a variant, since
 * that is what most tutorials and most agents still type.
 */
import type { HelpEntry } from './types'

export const GIT_HELP: readonly HelpEntry[] = [
  // ---- Looking before you touch anything ----
  {
    id: 'git-status',
    shell: 'any',
    category: 'git',
    task: 'See what has changed',
    summary:
      'Lists the files you have changed, which of them are staged for the next commit, and which branch you are on. Safe to run at any time, and the first thing to run when unsure.',
    command: 'git status',
    variants: [
      { label: 'Short form, one line per file', command: 'git status --short' },
      { label: 'Short form, plus how far ahead or behind the remote you are', command: 'git status -sb' }
    ],
    keywords: [
      'what changed',
      'changed files',
      'modified',
      'untracked',
      'staged',
      'which branch am i on',
      'state of the repo',
      'anything to commit',
      'status',
      'where am i in git'
    ]
  },
  {
    id: 'git-diff',
    shell: 'any',
    category: 'git',
    task: 'See the exact lines you changed',
    summary:
      'Shows your uncommitted edits line by line: red lines were removed, green lines were added. Press q to leave the viewer.',
    command: 'git diff',
    variants: [
      { label: 'Only what is already staged', command: 'git diff --staged' },
      { label: 'Only one file', command: 'git diff FILE' },
      { label: 'Just the file names and line counts', command: 'git diff --stat' }
    ],
    placeholders: { FILE: 'The path of the file to look at' },
    keywords: [
      'diff',
      'what did i change',
      'show changes',
      'line by line',
      'compare',
      'before commit',
      'staged changes',
      'cached',
      'review my edits',
      'how do i get out of the diff'
    ]
  },
  {
    id: 'git-log',
    shell: 'any',
    category: 'git',
    task: 'See the history of commits',
    summary:
      'Lists recent commits, one line each, with the branches drawn as a graph. Press q to leave the viewer.',
    command: 'git log --oneline --graph --decorate -n 20',
    variants: [
      { label: 'Full messages, authors and dates', command: 'git log -n 10' },
      { label: 'Only commits by one person', command: 'git log --author="NAME" --oneline' },
      { label: 'Only commits whose message mentions a word', command: 'git log --grep="TEXT" --oneline' }
    ],
    placeholders: { NAME: "Part of the author's name or email", TEXT: 'A word from the commit message' },
    keywords: [
      'history',
      'log',
      'past commits',
      'recent commits',
      'what happened',
      'timeline',
      'graph',
      'who committed',
      'commit list',
      'stuck in log press q'
    ]
  },
  {
    id: 'git-show',
    shell: 'any',
    category: 'git',
    task: 'See what one commit changed',
    summary:
      'Shows the message and the full diff of a single commit. Take the COMMIT id from git log; HEAD means the latest one.',
    command: 'git show COMMIT',
    variants: [
      { label: 'The latest commit', command: 'git show HEAD' },
      { label: 'Only which files it touched', command: 'git show COMMIT --stat' }
    ],
    placeholders: { COMMIT: 'A commit id from git log (the first 7 characters are enough)' },
    keywords: [
      'show commit',
      'what did this commit do',
      'inspect commit',
      'commit details',
      'commit diff',
      'hash',
      'sha',
      'last commit'
    ]
  },
  {
    id: 'git-file-history',
    shell: 'any',
    category: 'git',
    task: 'See the history of one file',
    summary: 'Lists only the commits that touched one file, newest first.',
    command: 'git log --oneline -- FILE',
    variants: [
      { label: 'With the lines each commit changed in it', command: 'git log -p -- FILE' },
      { label: 'Follow the file through renames', command: 'git log --oneline --follow -- FILE' }
    ],
    placeholders: { FILE: 'The path of the file' },
    keywords: [
      'file history',
      'when did this file change',
      'changes to one file',
      'log for a file',
      'who touched this file',
      'renamed file history',
      'follow'
    ]
  },
  {
    id: 'git-blame',
    shell: 'any',
    category: 'git',
    task: 'Find out who changed a line, and when',
    summary:
      'Prints the file with the commit, author and date that last changed each line. Follow up with git show COMMIT to see why.',
    command: 'git blame FILE',
    variants: [{ label: 'Only a range of lines (here 10 to 20)', command: 'git blame -L 10,20 FILE' }],
    placeholders: { FILE: 'The path of the file' },
    keywords: [
      'blame',
      'who wrote this',
      'who changed this line',
      'author of a line',
      'annotate',
      'when was this changed',
      'last modified by',
      'praise'
    ]
  },
  {
    id: 'git-search-history',
    shell: 'any',
    category: 'git',
    task: 'Find the commit that added or removed some text',
    summary:
      'Searches the whole history for commits where the number of times TEXT appears changed, which is how you find where a function or a setting came from or went.',
    command: 'git log -S "TEXT" --oneline',
    variants: [{ label: 'Search commit messages instead', command: 'git log --grep="TEXT" --oneline' }],
    placeholders: { TEXT: 'The exact text to look for' },
    keywords: [
      'search history',
      'when was this added',
      'when was this deleted',
      'find in old commits',
      'pickaxe',
      'where did this code go',
      'grep history',
      'find commit'
    ]
  },
  {
    id: 'git-compare-main',
    shell: 'any',
    category: 'git',
    task: 'Compare your branch with main',
    summary:
      'Shows everything your branch has changed since it left main, which is what a pull request would contain. The three dots matter: two dots would also show what main gained meanwhile.',
    command: 'git diff main...HEAD',
    variants: [
      { label: 'Just the file names and line counts', command: 'git diff --stat main...HEAD' },
      { label: 'The commits on your branch that main does not have', command: 'git log main..HEAD --oneline' },
      { label: 'Compare the files as they are right now, uncommitted edits included', command: 'git diff main' }
    ],
    keywords: [
      'compare branches',
      'diff with main',
      'diff against master',
      'what is in my branch',
      'pull request contents',
      'pr diff',
      'three dots',
      'ahead of main',
      'branch changes'
    ]
  },
  {
    id: 'git-unpushed',
    shell: 'any',
    category: 'git',
    task: 'See which commits you have not pushed yet',
    summary: 'Lists commits that exist on your machine and on no remote, so you know what a push would send.',
    command: 'git log --branches --not --remotes --oneline',
    variants: [{ label: 'Just the count, as "ahead N" beside the branch name', command: 'git status -sb' }],
    keywords: [
      'unpushed',
      'not pushed',
      'ahead of origin',
      'local commits',
      'what will push send',
      'did i push',
      'outgoing'
    ]
  },

  // ---- The everyday loop: stage, commit, sync ----
  {
    id: 'git-add',
    shell: 'any',
    category: 'git',
    task: 'Stage files for the next commit',
    summary:
      'Staging is choosing what goes into the next commit. Stage one file, or everything; nothing is saved to history until you commit.',
    command: 'git add FILE',
    variants: [
      { label: 'Everything in this folder and below', command: 'git add .' },
      { label: 'Every change in the whole repository, deletions included', command: 'git add -A' },
      { label: 'Choose piece by piece within a file (y to take, n to skip, q to stop)', command: 'git add -p' }
    ],
    placeholders: { FILE: 'The path of the file to stage' },
    keywords: [
      'stage',
      'add',
      'add files',
      'track a new file',
      'include in commit',
      'index',
      'untracked file',
      'add everything',
      'partial',
      'changes not staged for commit'
    ]
  },
  {
    id: 'git-unstage',
    shell: 'any',
    category: 'git',
    task: 'Unstage a file (keep the edits)',
    summary: 'Takes a file back out of the next commit. Your edits stay exactly as they are; only the staging is undone.',
    command: 'git restore --staged FILE',
    variants: [
      { label: 'Unstage everything', command: 'git restore --staged .' },
      { label: 'The older spelling of the same thing', command: 'git reset HEAD FILE' }
    ],
    placeholders: { FILE: 'The path of the file to unstage' },
    keywords: [
      'unstage',
      'undo add',
      'remove from commit',
      'added the wrong file',
      'un-add',
      'reset file',
      'take out of staging',
      'git add undo'
    ]
  },
  {
    id: 'git-commit',
    shell: 'any',
    category: 'git',
    task: 'Commit your staged changes',
    summary:
      'Saves what you staged as one point in history, with a message saying what it does. It stays on your machine until you push.',
    command: 'git commit -m "MESSAGE"',
    variants: [
      { label: 'Stage every already-tracked file and commit in one go (new files are not included)', command: 'git commit -am "MESSAGE"' },
      { label: 'Write a longer message in your editor', command: 'git commit' }
    ],
    placeholders: { MESSAGE: 'A short sentence describing the change' },
    keywords: [
      'commit',
      'save changes',
      'save my work',
      'snapshot',
      'checkpoint',
      'commit message',
      'record changes',
      'nothing added to commit',
      'check in'
    ]
  },
  {
    id: 'git-amend',
    shell: 'any',
    category: 'git',
    task: 'Fix the last commit message',
    summary:
      'Replaces the message of the most recent commit. Do it before pushing: an amended commit is a new commit, so one that was already pushed needs a force push afterwards.',
    command: 'git commit --amend -m "NEW_MESSAGE"',
    variants: [
      { label: 'Add a forgotten file to the last commit, message unchanged (stage it first)', command: 'git commit --amend --no-edit' }
    ],
    placeholders: { NEW_MESSAGE: 'The corrected commit message' },
    keywords: [
      'amend',
      'typo in commit message',
      'change commit message',
      'edit last commit',
      'reword',
      'forgot a file',
      'add to last commit',
      'fix commit'
    ]
  },
  {
    id: 'git-undo-last-commit',
    shell: 'any',
    category: 'git',
    task: 'Undo the last commit but keep the work',
    summary:
      'Removes the most recent commit and leaves all of its changes staged, as if you had not committed yet. Meant for a commit you have NOT pushed; for a pushed one, use revert instead.',
    command: 'git reset --soft HEAD~1',
    variants: [
      { label: 'Same, but leave the changes unstaged', command: 'git reset HEAD~1' },
      { label: 'Already pushed: add a new commit that reverses it', command: 'git revert HEAD' }
    ],
    keywords: [
      'undo commit',
      'uncommit',
      'committed too early',
      'committed to the wrong branch',
      'take back commit',
      'reset soft',
      'keep my changes',
      'go back one commit',
      'remove last commit'
    ]
  },
  {
    id: 'git-revert',
    shell: 'any',
    category: 'git',
    task: 'Undo a commit that was already pushed',
    summary:
      'Adds a NEW commit that does the opposite of an old one. History is not rewritten, so it is safe on a shared branch and needs no force push.',
    command: 'git revert COMMIT',
    variants: [{ label: 'Reverse the latest commit without opening the editor', command: 'git revert --no-edit HEAD' }],
    placeholders: { COMMIT: 'The id of the commit to reverse, from git log' },
    keywords: [
      'revert',
      'undo pushed commit',
      'back out a change',
      'reverse a commit',
      'rollback',
      'roll back',
      'safe undo',
      'undo on main'
    ]
  },
  {
    id: 'git-pull',
    shell: 'any',
    category: 'git',
    task: 'Update from the remote',
    summary:
      "Downloads the new commits for your branch and merges them into it. Commit or stash your own edits first if git refuses because they would be overwritten.",
    command: 'git pull',
    variants: [
      { label: 'Replay your own commits on top instead of making a merge commit', command: 'git pull --rebase' },
      { label: 'Only download, change nothing in your files yet', command: 'git fetch' },
      { label: 'Download, and forget remote branches that were deleted', command: 'git fetch --prune' }
    ],
    keywords: [
      'pull',
      'update',
      'get latest',
      'sync',
      'download changes',
      'fetch',
      'refresh from github',
      'behind origin',
      'your local changes would be overwritten',
      'get new commits'
    ]
  },
  {
    id: 'git-push',
    shell: 'any',
    category: 'git',
    task: 'Push your commits to the remote',
    summary:
      'Uploads your committed work to the remote (GitHub, for most people). If it is rejected because the remote has commits you lack, pull first and push again.',
    command: 'git push',
    keywords: [
      'push',
      'upload',
      'send to github',
      'publish commits',
      'share my work',
      'rejected',
      'non-fast-forward',
      'failed to push some refs',
      'updates were rejected'
    ]
  },
  {
    id: 'git-push-new-branch',
    shell: 'any',
    category: 'git',
    task: 'Push a new branch for the first time',
    summary:
      'A branch you just made does not exist on the remote yet. This creates it there under the same name and links the two, so plain git push and git pull work from then on.',
    command: 'git push -u origin HEAD',
    variants: [{ label: 'The same, naming the branch yourself', command: 'git push -u origin BRANCH' }],
    placeholders: { BRANCH: 'The name of your branch' },
    keywords: [
      'push new branch',
      'no upstream branch',
      'set upstream',
      'has no upstream',
      'publish branch',
      'first push',
      'set-upstream',
      'track remote branch',
      'open a pull request'
    ]
  },

  // ---- Branches ----
  {
    id: 'git-new-branch',
    shell: 'any',
    category: 'git',
    task: 'Make a new branch and switch to it',
    summary:
      'Starts a branch from where you are now and moves you onto it. Uncommitted edits come along, so this is also how you move work you started on main by mistake.',
    command: 'git switch -c BRANCH',
    variants: [
      { label: 'The older spelling of the same thing', command: 'git checkout -b BRANCH' },
      { label: 'Start it from the freshly fetched main rather than from here', command: 'git switch -c BRANCH --no-track origin/main' }
    ],
    placeholders: { BRANCH: 'The new branch name, no spaces (for example fix/login-button)' },
    keywords: [
      'new branch',
      'create branch',
      'make a branch',
      'start a feature',
      'checkout -b',
      'branch off',
      'working on main by mistake',
      'feature branch'
    ]
  },
  {
    id: 'git-switch-branch',
    shell: 'any',
    category: 'git',
    task: 'Switch to another branch',
    summary:
      'Moves you to an existing branch and updates your files to match it. Commit or stash first if git says your changes would be overwritten.',
    command: 'git switch BRANCH',
    variants: [
      { label: 'Back to the branch you were on before', command: 'git switch -' },
      { label: 'The older spelling of the same thing', command: 'git checkout BRANCH' }
    ],
    placeholders: { BRANCH: 'The name of the branch to move to' },
    keywords: [
      'switch branch',
      'change branch',
      'checkout',
      'go to main',
      'move to another branch',
      'previous branch',
      'go back to main',
      'please commit your changes or stash them'
    ]
  },
  {
    id: 'git-list-branches',
    shell: 'any',
    category: 'git',
    task: 'List branches, and see which one you are on',
    summary: 'Lists your local branches with a star beside the current one.',
    command: 'git branch',
    variants: [
      { label: 'Include the branches on the remote', command: 'git branch -a' },
      { label: 'Print only the name of the current branch', command: 'git branch --show-current' }
    ],
    keywords: [
      'list branches',
      'which branch',
      'current branch',
      'what branch am i on',
      'show branches',
      'remote branches',
      'all branches',
      'branch name'
    ]
  },
  {
    id: 'git-rename-branch',
    shell: 'any',
    category: 'git',
    task: 'Rename the branch you are on',
    summary:
      'Changes the local name of the current branch. If it was already pushed, push it again under the new name and delete the old one on the remote.',
    command: 'git branch -m NEW_NAME',
    placeholders: { NEW_NAME: 'The new name for the current branch' },
    keywords: ['rename branch', 'change branch name', 'typo in branch name', 'branch -m', 'master to main', 'move branch']
  },
  {
    id: 'git-delete-branch',
    shell: 'any',
    category: 'git',
    task: 'Delete a branch',
    summary:
      'Removes a local branch you have finished with. The lower-case -d refuses when the branch holds work that is merged nowhere, which is the safety net; switch off the branch before deleting it.',
    command: 'git branch -d BRANCH',
    variants: [
      { label: 'Delete it even though it is not merged (its commits become hard to find)', command: 'git branch -D BRANCH' },
      { label: 'Delete the branch on the remote too', command: 'git push origin --delete BRANCH' }
    ],
    placeholders: { BRANCH: 'The name of the branch to delete' },
    keywords: [
      'delete branch',
      'remove branch',
      'clean up branches',
      'old branches',
      'not fully merged',
      'delete remote branch',
      'tidy branches',
      'cannot delete branch checked out'
    ],
    danger:
      'The -D and --delete forms remove a branch whether or not its commits exist anywhere else; unmerged work is then reachable only through git reflog, and only for a while.'
  },
  {
    id: 'git-merge',
    shell: 'any',
    category: 'git',
    task: 'Merge another branch into this one',
    summary:
      'Brings the commits of BRANCH into the branch you are on. Switch to the branch that should RECEIVE the work first (usually main), then merge the other one in.',
    command: 'git merge BRANCH',
    variants: [{ label: 'Bring the latest main into your feature branch', command: 'git merge origin/main' }],
    placeholders: { BRANCH: 'The branch whose work you want to bring in' },
    keywords: [
      'merge',
      'combine branches',
      'bring in changes',
      'merge into main',
      'join branches',
      'fast-forward',
      'merge commit',
      'integrate'
    ]
  },
  {
    id: 'git-rebase-main',
    shell: 'any',
    category: 'git',
    task: 'Rebase your branch onto the latest main',
    summary:
      'Fetches main and replays your commits on top of it, so your branch reads as if it had started from today\'s main. If the branch was already pushed, the next push needs --force-with-lease.',
    command: 'git pull --rebase origin main',
    variants: [
      { label: 'The two-step form: download first', command: 'git fetch origin' },
      { label: 'Then replay your commits onto it', command: 'git rebase origin/main' }
    ],
    keywords: [
      'rebase',
      'rebase onto main',
      'update my branch',
      'branch is behind main',
      'out of date with base branch',
      'replay commits',
      'linear history',
      'catch up with main'
    ],
    danger:
      'A rebase rewrites the commits on your branch. Anyone else working on the same branch will conflict with it, so rebase only branches that are yours alone.'
  },
  {
    id: 'git-conflict',
    shell: 'any',
    category: 'git',
    task: 'Resolve a merge conflict',
    summary:
      'Lists the files in conflict. Open each one: between <<<<<<< and ======= is YOUR side, between ======= and >>>>>>> is the INCOMING side. Edit it to what it should be, delete all three marker lines, save, stage the file, then continue.',
    command: 'git diff --name-only --diff-filter=U',
    variants: [
      { label: 'Mark a file as resolved once you have edited it', command: 'git add FILE' },
      { label: 'Finish, when it was a merge', command: 'git merge --continue' },
      { label: 'Finish, when it was a rebase', command: 'git rebase --continue' },
      { label: 'Take one whole side for a file: --ours, or --theirs (in a rebase the two are swapped: ours is the branch you are rebasing onto)', command: 'git checkout --theirs FILE' }
    ],
    placeholders: { FILE: 'The path of a conflicted file' },
    keywords: [
      'conflict',
      'merge conflict',
      'conflict markers',
      'what do the arrows mean',
      'head and equals signs',
      'both modified',
      'unmerged paths',
      'automatic merge failed',
      'fix conflicts and then commit',
      'ours theirs',
      'resolve'
    ]
  },
  {
    id: 'git-abort',
    shell: 'any',
    category: 'git',
    task: 'Abort a merge or rebase and go back',
    summary:
      'Gives up on a merge that went wrong and puts everything back as it was before you started. Nothing is lost except the conflict resolutions you had made so far.',
    command: 'git merge --abort',
    variants: [
      { label: 'The same for a rebase', command: 'git rebase --abort' },
      { label: 'The same for a cherry-pick', command: 'git cherry-pick --abort' }
    ],
    keywords: [
      'abort',
      'cancel merge',
      'cancel rebase',
      'stop the merge',
      'get out of rebase',
      'rebase in progress',
      'start over',
      'go back to before the merge',
      'too many conflicts'
    ]
  },
  {
    id: 'git-cherry-pick',
    shell: 'any',
    category: 'git',
    task: 'Copy one commit onto this branch',
    summary:
      'Applies the change from a single commit on another branch as a new commit here, without merging the rest of that branch.',
    command: 'git cherry-pick COMMIT',
    placeholders: { COMMIT: 'The id of the commit to copy, from git log on the other branch' },
    keywords: [
      'cherry-pick',
      'cherry pick',
      'copy a commit',
      'move commit to another branch',
      'one commit only',
      'apply a commit',
      'backport',
      'committed to the wrong branch'
    ]
  },
  {
    id: 'git-detached-head',
    shell: 'any',
    category: 'git',
    task: 'Get back from a "detached HEAD"',
    summary:
      'Detached HEAD means you are looking at an old commit rather than standing on a branch. Nothing is broken. If you made no commits there, just switch back; if you did, put them on a branch first or they will be left behind.',
    command: 'git switch -',
    variants: [
      { label: 'Go to a named branch instead', command: 'git switch main' },
      { label: 'Keep the commits you made while detached, on a new branch', command: 'git switch -c BRANCH' }
    ],
    placeholders: { BRANCH: 'A name for the branch that will hold those commits' },
    keywords: [
      'detached head',
      'head detached at',
      'you are in detached head state',
      'not on a branch',
      'not currently on any branch',
      'how do i get back',
      'checked out a commit',
      'lost my branch'
    ]
  },

  // ---- Putting work aside ----
  {
    id: 'git-stash',
    shell: 'any',
    category: 'git',
    task: 'Put your changes aside, and get them back',
    summary:
      'Stash shelves your uncommitted edits and gives you a clean folder, for when you must switch branch or pull in the middle of something. Pop brings the newest stash back.',
    command: 'git stash',
    variants: [
      { label: 'Get the changes back (and remove them from the shelf)', command: 'git stash pop' },
      { label: 'Include brand-new files that git is not tracking yet', command: 'git stash -u' },
      { label: 'See what is on the shelf', command: 'git stash list' },
      { label: 'Get them back but keep a copy on the shelf', command: 'git stash apply' }
    ],
    keywords: [
      'stash',
      'put aside',
      'shelve',
      'save for later',
      'temporarily remove changes',
      'clean working tree',
      'unstash',
      'stash pop',
      'where did my changes go',
      'switch branch without committing'
    ]
  },

  // ---- Starting and configuring ----
  {
    id: 'git-clone',
    shell: 'any',
    category: 'git',
    task: 'Download (clone) a repository',
    summary:
      'Copies a repository from GitHub or elsewhere, with its full history, into a new folder under the one you are in.',
    command: 'git clone URL',
    variants: [
      { label: 'Choose the folder name', command: 'git clone URL FOLDER' },
      { label: 'Only the latest snapshot, much faster on a huge repository', command: 'git clone --depth 1 URL' }
    ],
    placeholders: {
      URL: 'The address from the green Code button, such as https://github.com/OWNER/REPO.git',
      FOLDER: 'The folder to create'
    },
    keywords: [
      'clone',
      'download repo',
      'get the code',
      'copy from github',
      'checkout a project',
      'shallow clone',
      'download a project',
      'repository url'
    ]
  },
  {
    id: 'git-init',
    shell: 'any',
    category: 'git',
    task: 'Start tracking a folder with git',
    summary:
      'Turns the folder you are in into a new, empty repository. Nothing is uploaded anywhere; add and commit your files next.',
    command: 'git init',
    variants: [{ label: 'Make sure the first branch is called main', command: 'git init -b main' }],
    keywords: [
      'init',
      'new repository',
      'new repo',
      'start git',
      'create a repository',
      'not a git repository',
      'fatal not a git repository',
      'version control this folder'
    ]
  },
  {
    id: 'git-remote',
    shell: 'any',
    category: 'git',
    task: 'See or change where the repository pushes to',
    summary: 'Shows the remote addresses this repository downloads from and uploads to; origin is the usual name.',
    command: 'git remote -v',
    variants: [
      { label: 'Connect a new local repository to GitHub', command: 'git remote add origin URL' },
      { label: 'Point origin somewhere else (a renamed repo, or https to ssh)', command: 'git remote set-url origin URL' }
    ],
    placeholders: { URL: 'The address of the repository on the server' },
    keywords: [
      'remote',
      'origin',
      'where does it push',
      'github url',
      'change remote',
      'add remote',
      'repository moved',
      'no configured push destination',
      'does not appear to be a git repository'
    ]
  },
  {
    id: 'git-identity',
    shell: 'any',
    category: 'git',
    task: 'Set your name and email for commits',
    summary:
      'Git stamps every commit with a name and an email, and refuses to commit until they are set. Run both lines once per machine; use the email of your GitHub account so commits link to you.',
    command: 'git config --global user.name "YOUR_NAME"',
    variants: [
      { label: 'The email, the second half', command: 'git config --global user.email "EMAIL"' },
      { label: 'Check what is set', command: 'git config --global --list' }
    ],
    placeholders: { YOUR_NAME: 'Your name as it should appear in history (spaces are fine inside the quotes)', EMAIL: 'Your email address' },
    keywords: [
      'name and email',
      'user.name',
      'user.email',
      'please tell me who you are',
      'author identity unknown',
      'configure git',
      'set up git',
      'git config',
      'wrong author'
    ]
  },
  {
    id: 'git-untrack-ignored',
    shell: 'any',
    category: 'git',
    task: 'Ignore a file that git is already tracking',
    summary:
      'A .gitignore entry only affects files git is not tracking yet. This stops tracking the file while leaving it on your disk; add it to .gitignore and commit, and git leaves it alone from then on.',
    command: 'git rm --cached FILE',
    variants: [
      { label: 'A whole folder', command: 'git rm -r --cached FOLDER' },
      { label: 'Ask which .gitignore rule is (or is not) catching a file', command: 'git check-ignore -v FILE' }
    ],
    placeholders: { FILE: 'The path of the file to stop tracking', FOLDER: 'The path of the folder to stop tracking' },
    keywords: [
      'gitignore',
      'gitignore not working',
      'ignore file',
      'stop tracking',
      'untrack',
      'committed .env by mistake',
      'node_modules in git',
      'remove from git keep file',
      'rm cached'
    ],
    danger:
      'The file stays on YOUR disk, but the commit records it as deleted, so it disappears from the folder of everyone else who pulls. It also remains in the older history, so a committed secret must still be changed.'
  },
  {
    id: 'git-tag',
    shell: 'any',
    category: 'git',
    task: 'Tag a version',
    summary:
      'A tag is a permanent name for one commit, normally a release such as v1.2.0. Tags are not sent by a plain push; push them by name.',
    command: 'git tag -a TAG -m "MESSAGE"',
    variants: [
      { label: 'Send that tag to the remote', command: 'git push origin TAG' },
      { label: 'List the tags', command: 'git tag' },
      { label: 'Delete a local tag', command: 'git tag -d TAG' }
    ],
    placeholders: { TAG: 'The tag name, such as v1.2.0', MESSAGE: 'A short note, such as Release 1.2.0' },
    keywords: [
      'tag',
      'version',
      'release',
      'mark a release',
      'v1.0.0',
      'push tags',
      'list tags',
      'annotated tag',
      'label a commit'
    ]
  },

  // ---- Getting things back ----
  {
    id: 'git-restore-old-version',
    shell: 'any',
    category: 'git',
    task: 'Get a file back as it was in an older commit',
    summary:
      'Overwrites one file in your folder with the version from an earlier commit, and leaves everything else alone. Commit the result to keep it.',
    command: 'git restore --source=COMMIT FILE',
    variants: [{ label: 'Bring back a file you deleted and have not committed', command: 'git restore FILE' }],
    placeholders: { COMMIT: 'The commit id to take the file from (or HEAD~1 for one commit ago)', FILE: 'The path of the file' },
    keywords: [
      'old version of a file',
      'restore file',
      'recover deleted file',
      'get file from previous commit',
      'go back to earlier version',
      'undelete',
      'accidentally deleted',
      'checkout file from commit'
    ],
    danger: 'The current contents of FILE are replaced; uncommitted edits in it are lost.'
  },
  {
    id: 'git-reflog',
    shell: 'any',
    category: 'git',
    task: 'Find commits you thought you had lost',
    summary:
      'Lists everywhere HEAD has been lately, including commits no branch points at any more (after a bad reset, a rebase, a deleted branch). Find the id, then put a branch on it.',
    command: 'git reflog -n 30',
    variants: [{ label: 'Put a branch on a commit you found, so it is safe again', command: 'git branch BRANCH COMMIT' }],
    placeholders: { BRANCH: 'A name for the rescue branch', COMMIT: 'The id from the reflog' },
    keywords: [
      'reflog',
      'lost commits',
      'recover commit',
      'undo reset hard',
      'undo rebase',
      'deleted branch by mistake',
      'get my work back',
      'where did my commits go',
      'rescue'
    ]
  },

  // ---- The ones that destroy work ----
  {
    id: 'git-discard-file',
    shell: 'any',
    category: 'git',
    task: 'Discard your changes to a file',
    summary:
      'Throws away the uncommitted edits in one file and puts back the last committed version. Run git diff FILE first to see what you are about to lose.',
    command: 'git restore FILE',
    variants: [
      { label: 'Discard the edits in every tracked file under this folder', command: 'git restore .' },
      { label: 'The older spelling of the same thing', command: 'git checkout -- FILE' }
    ],
    placeholders: { FILE: 'The path of the file to put back' },
    keywords: [
      'discard changes',
      'undo changes',
      'undo my edits',
      'revert file',
      'throw away changes',
      'reset a file',
      'go back to last commit',
      'start over on a file',
      'the agent broke my file'
    ],
    danger: 'Uncommitted edits were never saved anywhere, so git cannot bring them back. There is no undo.'
  },
  {
    id: 'git-force-push',
    shell: 'any',
    category: 'git',
    task: 'Force-push safely after a rebase or amend',
    summary:
      'After rewriting commits that were already pushed, a normal push is rejected. --force-with-lease overwrites the remote branch ONLY if nobody has pushed to it since you last fetched; plain --force checks nothing, so prefer this always.',
    command: 'git push --force-with-lease',
    keywords: [
      'force push',
      'force-with-lease',
      'push rejected after rebase',
      'push after amend',
      'overwrite remote',
      'push -f',
      'diverged',
      'your branch and origin have diverged',
      'non-fast-forward'
    ],
    danger:
      'The commits on the remote branch are replaced by yours. Never do this to main or to a branch other people work on.'
  },
  {
    id: 'git-reset-hard',
    shell: 'any',
    category: 'git',
    task: 'Throw away ALL uncommitted changes',
    summary:
      'Resets every tracked file to the last commit, staged or not. New untracked files are left alone. Run git status first, and consider git stash, which does the same tidy-up and keeps a way back.',
    command: 'git reset --hard HEAD',
    variants: [
      { label: 'Also drop your local commits: make the branch identical to the remote main (fetch first)', command: 'git reset --hard origin/main' }
    ],
    keywords: [
      'reset hard',
      'discard everything',
      'throw away all changes',
      'start over',
      'back to last commit',
      'wipe my changes',
      'match the remote',
      'make it like github',
      'nuke changes'
    ],
    danger:
      'Every uncommitted edit in every tracked file is gone for good. Commits dropped by the origin/main form can be found again through git reflog; edits that were never committed cannot.'
  },
  {
    id: 'git-clean',
    shell: 'any',
    category: 'git',
    task: 'Delete untracked files and folders',
    summary:
      'Removes everything git is not tracking: build leftovers, scratch files, new files never added. ALWAYS run the preview variant first; it lists what would go and deletes nothing.',
    command: 'git clean -fd',
    variants: [
      { label: 'PREVIEW: list what would be deleted, delete nothing', command: 'git clean -nfd' },
      { label: 'Also delete files that .gitignore hides (node_modules, build output, .env)', command: 'git clean -fdx' }
    ],
    keywords: [
      'clean',
      'remove untracked files',
      'delete untracked',
      'delete new files',
      'clean working directory',
      'remove build files',
      'get rid of junk files',
      'dry run',
      'fresh checkout'
    ],
    danger:
      'The files are deleted from disk straight away, not moved to the Recycle Bin, and git never had a copy. The -x form also takes ignored files such as .env.'
  }
]
