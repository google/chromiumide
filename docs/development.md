# ChromiumIDE Development Guide

## About this document

This is a document for IDE developers.

This document gathers best practices we've accumulated for ChromiumIDE development.

This is a living document. Please feel free to make changes and/or add something new!

Please also help by reporting bugs at https://github.com/google/chromiumide/issues !

## Basic workflow

In this document `~/chromiumos` represents a chromiumos repository, but other locations work as well.

**NB:** Don't use a symlinked directory for development. Symlinks cause [errors](https://github.com/typescript-eslint/typescript-eslint/issues/2987) on eslint VSCode plugin.

### Getting started

1. [Install nvm](https://github.com/nvm-sh/nvm#install--update-script).
2. Install proper version of using nvm, running the following command in `~/chromiumos/infra/ide/chromiumide` directory.
  ```bash
  nvm install && nvm use
  ```
3. Install OpenJDK 21+ and Maven (e.g. sudo apt install openjdk-21-jdk maven)
4. In the same directory, confirm `npm --version` returns >= 8.0.0.
  * If it doesn't try: `npm install -g npm@latest`
5. Run `npm ci` to install dependencies.
6. Run `npm t` to confirm tests pass.

### VSCode Setup

1. Open the chromiumide directory with VSCode.
  * (Press Ctrl-Shift-P, run the Add Folder to Workspace command, and select `~/chromiumos/infra/ide/chromiumide`).
  * **Pitfall:** You must open your workspace with the chromiumide directory, otherwise tooling such as eslint will not work correctly
2. To avoid having to deal with extra issues during repo upload:
  * Make sure to have ESlint and Prettier installed.
    * Recommended extensions are listed in [extensions.json](/.vscode/extensions.json).

### Manual testing

Make sure you open chromiumide as a workspace in VSCode.

(See [Debugging the tests](https://code.visualstudio.com/api/working-with-extensions/testing-extension#debugging-the-tests) for visual guide) Click the "Run and Debug" icon in the Activity Bar, select the "Run Extension" menu, and click the "Start Debugging" button or press F5. It should launch a new window where the extension built from the source code is installed. Then you can perform whatever manual tests on it.

Alternatively, you can run `./dev_install.sh` in the VSCode terminal to install the extension from the local source code.

### Running automated tests

* From command line
  * `npm t` runs all the tests and linters that should be run before sending the change to review.
  * For fast iteration, rather than running `npm t` every time, we can run the following commands individually. Running `npm t` is only required just before uploading a CL.
    * `npm run unit-test` - unit test
    * `npm run integration-test` - integration test
    * `npm run check` - type check
    * `npm run lint` - lint code and license
    * `npm run fix` - fix lint issues (hopefully)
* From GUI
  * In the "Run and Debug" view, you can select "Run Unit Tests" to run the unit tests. The output will be shown in the Debug Console in the IDE used to develop the extension.
* To run a single test, temporarily change the test code from "describe" to "fdescribe" or from "it" to "fit".( The "f" stands for "focus".) Then run `npm t`.

### Getting code reviews

Before sending code reviews, please make sure:

* You're following [our coding styles](#coding-styles).
* You've added unit tests for new code.
* `npm t` passes (it is also checked on `repo upload`).

Also, if your change makes UI visible changes, please consider attaching screenshots. This makes it easier for reviewers to know what your change is about, and to ensure you have manually verified the change.

## Coding styles

We follow the [Google TypeScript style guide](https://google.github.io/styleguide/tsguide.html).

This project contains configurations for [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/) derived from [GTS](https://github.com/google/gts). Install [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) to your VSCode to see lint errors in real-time and format on save. From command lines, you can run `npm run lint` to check lint errors, and `npm run fix` to fix many of them automatically.

Note that we have slight deviations from [Google TypeScript style guide](https://google.github.io/styleguide/tsguide.html):

* Function parameters with a leading underscore can be unused.
* Indentation style is a bit different (e.g. 2-space indentation for continued lines). This difference comes from the fact that GTS uses Prettier as the code formatter, in contrast to clang-format used within Google.

## Code organization

### Directory structure

* chromiumide/
  * README.md ... README shown on extension marketplace
  * package.json ... NPM configs + VSCode extension configs
  * docs/ ... various documentations for developers
  * src/ ... main source code
    * extension.ts ... the entry point of the extension
    * common/ ... common utils
    * services/ ... legacy module for common utils
    * features/ ... implementation of extension features
    * tools/ ... CLI tools (installation script, repo hooks)
    * test/ ... test code
      * unit/ ... unit tests
      * integration/ ... integration tests
      * testing/ ... common testing utils
  * views/ ... webview source code
  * resources/ ... misc files shipped with extension
  * shared/ ... shared features

Notes:

* `src/common` should not depend on modules outside common.
* `src/features` can depend on `src/common`.

### Activation chain

The activate function in `src/extension.ts` is the entry point of the extension. Since ChromiumIDE is a collection of many different features, we have a lot of things to do on activation; but it isn't scalable to do everything in `src/extension.ts`. Therefore `src/extension.ts` should do only minimal things and call into activate functions, or instantiate a class defined in other files.

## VSCode extension general best practices

### Use async/await instead of raw promises

Many functions in VSCode extensions return `Promise<T>` instead of `T` when they need asynchronous operations, such as reading/writing to files/sockets.

Always use ES6 async functions to work with promises, instead of calling into a promise API directly. Async functions are much easier to understand.

**Do:**

```typescript
async function loadConfig(): Promise<Config> {
const data = await readConfig();
  return parseConfig(data);
}
```

**Don't:**

```typescript
function loadConfig(): Promise<Config> {
  return readConfig().then((data) => {
    return parseConfig(data);
  });
}
```

### Handle promises correctly

Failing to await promises leads to some bugs difficult to debug: errors are silently ignored and not reported to the user; race conditions are met due to unexpected parallel operations. We have set up two promise-related ESLint rules: [no-floating-promises](https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/no-floating-promises.md) and [no-misused-promises](https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/no-misused-promises.md), which should catch most of such bugs.

Below are tips to fix promise lint errors.

If you need to call an async function from a non-async function, you can use an async [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE) to handle promise rejections. Try to avoid Promise.catch() as mentioned in the previous section.

**Do:**

```typescript
function showHint(): void {
  void (async () => {
    const choice = await vscode.window.showInformationMessage(
      'You can set up sudo to request passwords less frequently.',
      'Open Documentation'
    );
    if (choice) {
      void vscode.env.openExternal(documentationUri);
    }
  })();
}
```

**Don't:**

```typescript
function showHint(): void {
  vscode.window.showInformationMessage(
    'You can set up sudo to request passwords less frequently.',
    'Open Documentation'
  ).then(choice => {
    void vscode.env.openExternal(documentationUri);
  });
}
```

There are several cases where it is valid not to await a promise. Namely, if you're sure that:

1. you don't need to wait for the promise, and
2. the promise is never rejected, and
3. you don't need the promise result

then it is fine to ignore a promise. You can use the void operator to ignore a promise explicitly.

**Do:**

```typescript
void vscode.env.openExternal(documentationUri);
```

Popular functions whose results you might want to ignore are:

* vscode.window.showInformationMessage (without buttons)
* vscode.window.showErrorMessage (without buttons)
* vscode.env.openExternal

### Get activation info from vscode.ExtensionContext

VSCode passes vscode.ExtensionContext to an extension on its activation. It contains several important informations, notably:

* extensionUri: File path where the extension is installed.
* extensionMode: The reason why the extension was activated.
* subscriptions: Array you can push any objects to be disposed on deactivation of the extension (see [vscode.Disposable section](#use-vscode.disposable-to-release-resources-after-use) for details)

If your feature needs ExtensionContext, make sure your activation function takes ExtensionContext as an argument and create a class that stores ExtensionContext (or its subset relevant to your feature) in its field.

### Use vscode.Disposable to release resources after use

vscode.Disposable is a general interface to release resources after use.

Many VSCode API return vscode.Disposable, such as:

* vscode.commands.registerCommand
* vscode.commands.registerTextEditorCommand
* vscode.window.registerTreeDataProvider
* vscode.Event
* ...

There are two general approaches to make sure to dispose of vscode.Disposable.

1. If you create a disposable resource on extension activation, push it to ExtensionContext.subscriptions. Then VSCode automatically releases it on deactivation of the extension.
2. In other cases, store disposable resources on class instance fields and implement vscode.Disposable in your class to release them recursively.

**Do (pushing to ExtensionContext.subscriptions in activation functions):**

```typescript
function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chromiumide.doSomething', () => doSomething()));
  context.subscriptions.push(new ConfigWatcher());
}
```

**Do (recursively disposing of objects):**

```typescript
class ConfigWatcher implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  constructor() {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(() => this.onConfigUpdate()));
    }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private onConfigUpdate(): void { ... }
}
```

**Don't:**

```typescript
class ConfigWatcher {
  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(() => this.onConfigUpdate()));
  }
}
```

###

## Use vscode.Event to decouple components

vscode.Event is the standard way to register callbacks for events in VSCode. VSCode API provides many events to register, e.g. vscode.window.onDidChangeActiveTextEditor. You can also define your own events with vscode.EventEmitter, which allows you to introduce abstraction for decoupling components.

Below is an idiom to provide vscode.Event in classes.

**Do:**

```typescript
class ConfigWatcher implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeEmitter,
  ];

  constructor() { ... }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }
}
```

Beware that a cyclic dependency graph (disregarding the edge orientation) among components can lead to inconsistencies. To avoid this problem, make the dependency graph a tree.

For example, consider components A, B, and C, where B depends on A and C depends on both A and B. If C's event handler listens for updates from A, it may see stale state from B before B has been updated in response to A's change. This issue can be addressed by having B return A's state as well. This way, C can get the latest state of A from B, without having to depend on A directly.

## VSCode UI best practices

See also: [VSCode UI guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)

### User inputs

There are several ready-made UIs to prompt for user inputs.

| Quick Picks | Input Boxes |
| :---- | :---- |
| TODO: Insert an image | TODO: Insert an image |

How to choose a right UI:

* If you want the user to pick one from a fixed set of items, use Quick Picks.
* If you want the user to enter a free-form text, use Input Boxes.

If you want to show a list of candidates but also allow the user to enter a free-form text, you can use a hack to use Quick Picks while showing the user input always as a first item. See [this code](https://github.com/google/chromiumide/blob/main/shared/app/ui/input_box.ts#L65) for an example implementation.

See also: [VSCode UX guidelines for Quick Picks](https://code.visualstudio.com/api/ux-guidelines/quick-picks)

### Progress

When the extension runs a long-running operation, you should:

* show the progress to the user
* allow the user to cancel the operation (if the operation can be really long)

You can use `vscode.window.withProgress` to show progress. You have two possible choices to show progress: status bar and notification.

| Progress in the status bar | Progress in notifications |
| :---- | :---- |
| TODO: Insert an image | TODO: Insert an image |

How to choose a right UI:

* If the operation is low priority (e.g. background operations), show in the status bar.
* If the operation is high priority (e.g. user-initiated actions), show in notifications.

Note: Notifications provide an easy way to allow the user to cancel the operation.

See also: [VSCode UX guidelines for notifications](https://code.visualstudio.com/api/ux-guidelines/notifications)

### Reporting errors

We identified two principles for error handling:

1. **Do not hide errors.** Our audience are power users, who can often help themselves if they know what's broken. If they can't, they should be able to report problems easily. A common scenario here is that when you run an external command, consider what happens when it's not available or it fails.
2. IDE should **remain usable** even if some functionality is broken. Abusing popups can make this problematic, so consider showing them **only once** during a session.

These principles led us to the following guidelines:

* UI action taken by the user resulted in an error. ⇒ Show a non-modal pop up.
  * **Examples:** lease a new device, start working on a package.
* Background tasks encountered a problem. ⇒ Use the status bar.
  * **Examples:** C++ xrefs generation, linting on save.
  * We have a custom status bar item ([bg\_task\_status.ts](https://github.com/google/chromiumide/blob/main/shared/app/ui/bg_task_status.ts))
  * Clicking on *ChromiumIDE → IDE Status* can take the user to logs (but other actions are possible too).
* Use the IDE error status (![][image6]) only for persistent failures that prevent the user from completing their task, i.e. failures that the user should notice and fix on their side. If the error is transient, or if you don't know how the user can fix the issue, report it to metrics and logging instead.

### Running external commands

You can use [`commonUtil.exec`](https://github.com/google/chromiumide/blob/main/shared/app/common/common_util.ts) to run external commands.

**TODO**: Elaborate this section. Possible topics:

* Choosing right UIs
  * Terminal
  * OutputChannel
  * Task?

### Webview

**TODO**: Write this section. Possible topics:

* Source code location for Webview scripts
* Accessing localhost
* Message passing

### Syntax Highlighting

* Start with the official guide: [code.visualstudio.com/api/language-extensions/syntax-highlight-guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)
* The following pages are useful for learning how to write a grammar:
  * [www.apeth.com/nonblog/stories/textmatebundle.html](https://www.apeth.com/nonblog/stories/textmatebundle.html)
  * [macromates.com/manual/en/language\_grammars](https://macromates.com/manual/en/language_grammars)
  * [macromates.com/manual/en/regular\_expressions](http://macromates.com/manual/en/regular_expressions) \- you'll be using Oniguruma regular expressions
* Put your configuration files under languages/
  * `tmGrammar.json` files control syntax highlighting
  * language configuration files control editor behavior, for example, that Ctrl+/ inserts the right comment character (// or \#).
* Syntax highlighting can and should be tested. We use [github.com/PanAeon/vscode-tmgrammar-test](https://github.com/PanAeon/vscode-tmgrammar-test). Tests are  run from language/ directory manually with vscode-tmgrammar-test \-g upstart.tmLanguage.json upstart-syntax-test.conf
* Another neat feature are outlines (the usual list of classes and functions you see in an IDE) . They are implemented using [DocumentSymbolProvider](https://code.visualstudio.com/api/references/vscode-api#DocumentSymbolProvider).

## ChromiumIDE best practices

### Returning or throwing an Error

A fallible function can return or throw an error. In any case, the API should be designed so that the caller deliberately handles the error. If a function returns a type `T`, it can return a `T | Error` type to enforce the caller to check the error. It can throw an error as well if the function is named so that the caller can easily tell that it throws.

**Do (returns an error):**

```typescript
/** Document when the function returns an error */
function exec(...): Promise<ExecReuslt | Error> {
  ...
}
```

**Do (the function name indicates that it throws):**

```typescript
/** Document when the function throws an error */
function execOrThrow(...): Promise<ExecResult> {
  ...
}
```

**Don't (no indication that the function throws):**

```typescript
function exec(): Promise<ExecResult> {
  ...
  throw new Error('surprise!');
  ...
}
```

### Metrics

Use the [`Metrics`](https://github.com/google/chromiumide/blob/main/src/driver/metrics/metrics.ts) module to send events to Google Analytics. Visit go/chromiumide-dashboard for the dashboard. To add a new metrics event you should add the corresponding type definition [`metrics_event.ts`](https://github.com/google/chromiumide/blob/main/shared/app/common/metrics/metrics_event.ts).

**Example:**

```typescript
Metrics.send({
  category: 'interactive',
  group: 'codesearch',
  action: 'open current file',
});
```

If you want to log additional data to the event, add the field with an underscore(`_`)-separated name, and the value should be either number or string.

Regarding naming, since there is a 50 custom dimension/metrics limit per project, we try to reuse them across event types whenever possible (e.g. `exit_code` is a metric we might want to know for any command, so do not specify the command in the field name to the one you add it for).

To be able to filter events by that new field on the GA report, you need to add it to its settings as well:

1. On the bottom left corner, click the gear icon to open the Admin settings.
2. In the "data display" panel, click to open "custom definitions".
3. If the new metrics field is string-typed, click "create custom dimension". Otherwise (if it is a number), switch to the ‘custom metrics' tab and click "create custom metric".
  - Dimension/metrics name - Conventionally it is the same as the field name but in natural language (convert `_` to space, capitalize the first letter of each word).
  - Scope - always "event".
  - Description - human readable description of what the variable means.
  - Event parameter - *the same* as the field name. If there is already an event instance logged (e.g. if you set this up after the feature is released), it should be available in the drop-down menu. Otherwise you can enter it manually.
    - **!!!** You can NOT edit this after the dimension/metrics is created.

### Logging and Reporting Progress

Create an OutputChannel and register it to [bgTaskStatus.StatusManager](https://github.com/google/chromiumide/blob/main/shared/app/ui/bg_task_status.ts) for logging. Example:

```typescript
const output = vscode.window.createOutputChannel('ChromiumIDE: Device Management');

...

statusManager.setTask('Device Management', {
  status: TaskStatus.OK,
  command: {
    command: 'chromiumide.deviceManagement.openLogs',
    title: 'Open Device Management Logs',
  },
});
```

Then, when the user clicks ChromiumIDE status menu, the registered item is shown in the IDE STATUS sidebar, and by clicking individual items the user can see the log output of the corresponding channel. (Our solution uses a command. Doing something else, rather than showing the log, is possible, but we haven't used it for anything else.)

Task status can have 3 possible values:

* OK
* RUNNING - it will show a spinner in the status bar indicating that something is in progress. Currently it is used only by C++ support.
* ERROR - if any task has this state, the status bar item will turn red, which is an unobtrusive way of making problems discoverable.

The status is shown next to the task in a sidebar and they are combined into one in the status bar.

How to use tasks depends on what your feature does:

* Short running tasks can use OK and ERROR and update the task upon completion.
* Long running tasks should set their status to RUNNING when they start.
* Some features may want to register a task with OK initially to make their logs discoverable.

### Guarding features with flags

Incomplete features can be hidden. We do this by introducing configuration settings, which are false by default, and using them to guard activate function and UI elements with when clauses. See [crrev.com/c/3499666](http://crrev.com/c/3499666) for an example. Click [here](#guarding-features-with-flags-verbose) for more details.

To enable a feature go to `File > Preference > Settings` (Ctrl+,) and then `Extensions > CrOS` (ChromiumIDE must be activated first). After enabling a feature, run 'Developer: Reload Window' (Ctrl+R) to make sure it is loaded correctly.

### Common utilities

Common utilities are put under src/common directory. For example, it contains utilities to execute external commands inside or outside chroot.

### Module import vs destructuring import

As the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html#module-versus-destructuring-imports) says, there are tradeoffs between module imports and destructuring imports. That said, we consider module import is a safer choice if you are unsure which to use, because:

* Module imports give a name to the entire module and each symbol reference mentions the module, which can make code more readable and gives autocompletion on all symbols in a module.
* Module imports are particularly useful when using many different symbols from large APIs.

Destructive imports are useful when:

* You're importing a common symbol, for example, ChrootService or cleanState in tests.
* The name of the imported symbol is descriptive on its own.
* The imported symbol occurs many times in the file.

### Configuration

Settings defined in the configuration section of package.json should be accessed via [src/services/config.ts](https://github.com/google/chromiumide/blob/main/shared/app/services/config.ts).

## Testing your features

For a thorough and general explanation of unit and integration tests and their best practices, see [SWE book](https://abseil.io/resources/swe-book/html/toc.html).

### General best practices

Each non-trivial, functionality change that impacts the user should have accompanying unit tests in the same CL that prove the changes work correctly. Integration tests are also useful to assure components coordinate correctly, with each other and/or with external resources.

### Unit tests vs. integration tests

Unit tests test a single software component. Each spec in jasmine (each "it") in a unit test should usually be testing a single function. Unit tests should be a regular part of functionality changes. They should typically be small/non-blocking, and therefore should usually mock or fake external resources (files, network, devices, display, etc.)

In ChromiumIDE, a difference between unit tests (tests in test/unit) and integration tests (tests in test/integration) is that unit tests don't depend on real vscode modules, but integration tests can use real vscode modules and are run by the [VSCode test runner](https://code.visualstudio.com/api/working-with-extensions/testing-extension).

### Faking and Spying for Tests

#### Fake VSCode

In unit tests, we fake the vscode module with [`injected_modules`](https://github.com/google/chromiumide/tree/main/src/test/unit/injected_modules), so that we can unit-test features depending on vscode. If a unit test fails due to missing fake implementation, you can implement it in `injected_modules`. There are also fake VSCode class implementations under [`testing/fakes`](https://github.com/google/chromiumide/tree/main/src/test/testing/fakes), which you can use to substitute a parameter expecting a real.

**Example:**

```typescript
new crosfleet.CrosfleetRunner(
  cipdRepository,
  new fakes.VoidOutputChannel() // for vscode.OutputChannel
),
```

#### Spy vscode

You can run [`testing.installVscodeDouble()`](https://github.com/search?q=repo%3Agoogle%2Fchromiumide%20installVscodeDouble&type=code) to spy certain VSCode API calls or emit fake VSCode events from tests.

#### Mock filesystem

Using real file systems is recommended over using mock. See the next section.

#### Fake filesystem

You can create a temporary directory by calling [`testing.tempDir`](https://github.com/google/chromiumide/blob/main/src/test/testing/fs.ts#L28) in the `describe` clause and put files under the directory for test setup. The temporary directory is automatically removed after each test.
Under `testing`, there are libraries to build fake environments such as chroot and unit tests can call it with a temporary directory to make the SUT recognize the directory to be the corresponding environment.

**Example:**

```typescript
describe('chroot service exec', () => {
  const tempDir = testing.tempDir();
  it('calls cros_sdk if outside chroot', async () => {
    await testing.buildFakeChroot(tempDir.path);
    ...
  });
});
```

#### Fake exec

[`commonUtil.exec`](https://github.com/google/chromiumide/blob/main/shared/app/common/common_util.ts) is the standard way of running external commands in ChromiumIDE. You can use [`testing.installFakeExec()`](https://github.com/google/chromiumide/blob/main/src/test/testing/fake_exec.ts) to install fake handlers of the function call.

### Integration tests

**TODO**: Write this section. Possible topics:

* Isolated contexts
* Activating the extension and getting API

## Others

### Releasing the extension

See [the releasing doc](/docs/releasing.md).

### Root-causing unit tests flakiness

Is `npm run unit-test` flaky? We have a [script](https://github.com/google/chromiumide/blob/main/tools/root_cause_flakiness.ts) to root cause unit tests flakiness. See the comment on the script for its usage.

## Appendix

### Guarding features with flags (verbose)

Say you are developing a feature foo bar, you make the following edit:

1. Update [package.json](https://github.com/google/chromiumide/blob/main/package.json) to add a configuration

```json
"configuration": {
  ...
  "chromiumide.underDevelopment.fooBar": {
    "type": "boolean",
    "description": "Enable foo bar support (incomplete)",
    "default": false
  },
  ...
```

2. Update [src/services/config.ts](https://github.com/google/chromiumide/blob/main/shared/app/services/config.ts) to add a field corresponding to the configuration

```typescript
export const underDevelopment = {
  ...
  fooBar: new ConfigValue<boolean>('underDevelopment.fooBar'),
  ...
};
```

3. Add a new file in `src/features/` directory. e.g. `src/features/foo_bar.ts`.

```typescript
// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
export function activate(_context: vscode.ExtensionContext) {
  // TODO: implement the feature
  vscode.window.showInformationMessage('Hello foo bar!');
}
```

4. Update `src/extension.ts` to activate the feature conditionally.

```typescript
...

import * as fooBar from './features/foo\_bar';
async function activate(...) {
  ...
  if (config.underDevelopment.fooBar.get()) {
    fooBar.activate(context);
  }
  ...
}
```
